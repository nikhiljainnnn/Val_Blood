"""
backend/agent/orchestrator.py  — Phase 1 refactor
===================================================
Replaces the monolithic ReAct while-loop with a LangGraph StateGraph invocation.

Old pattern (broken):
  while True:
      response = bedrock.invoke(messages)
      if tool_uses: execute_tools()
      elif stop_reason == "end_turn": break
  → caused infinite loops, impossible to debug

New pattern (fixed):
  graph = get_graph()           # compiled StateGraph, built once
  result = graph.invoke(state)  # deterministic, recursion_limit enforced
  → LangSmith traces every hop, no more infinite loops

All existing API endpoints preserved with identical request/response shapes.
New: /agent/graph/info, /agent/donors/top, /agent/donors/at-risk

LangSmith tracing (set these env vars, no code changes needed):
  LANGCHAIN_TRACING_V2=true
  LANGCHAIN_API_KEY=<from langsmith.com>
  LANGCHAIN_PROJECT=raksetu-production
"""
from __future__ import annotations

import logging
import os
from datetime import datetime
from typing import Any

from fastapi import APIRouter
from langchain_core.messages import HumanMessage
from pydantic import BaseModel

from agent.graph import get_graph, get_initial_state
from agent.state import MAX_RECURSION

logger = logging.getLogger("raksetu.orchestrator")

DEMO_MODE = os.getenv("DEMO_MODE", "true").lower() == "true"

router = APIRouter(prefix="/agent", tags=["agent"])

_SCHEDULED_TASKS = {
    "daily_churn_scan": (
        "Check churn risk for all active bridge donors above 0.6 threshold. "
        "For each at-risk donor, review their history and recommend a re-engagement action."
    ),
    "patient_request": (
        "An urgent transfusion request has arrived. "
        "Find the best matched donor, verify their churn risk is acceptable, "
        "then send personalised outreach via their preferred channel."
    ),
    "weekly_stories": (
        "Generate personalised impact stories for all donors who completed "
        "a donation in the last 7 days. Send each story in the donor's language."
    ),
    "conversion_scoring": (
        "Run conversion scoring for all one-time donors. "
        "Identify the top 50 candidates for bridge assignment and send invitations."
    ),
    "activate_guests": (
        "Run the guest activation scan. Contact dormant guests whose blood group "
        "matches current patient needs. Prioritise rare blood groups."
    ),
    "past_due_alerts": (
        "Get the urgency summary. Fire outreach cascades for all critical "
        "and urgent patients. Generate a coordinator summary."
    ),
}


async def invoke_graph(task: str, context: dict[str, Any] | None = None,
                        thread_id: str | None = None) -> dict:
    """Invoke the LangGraph StateGraph with a task string."""
    graph  = get_graph()
    state  = get_initial_state(task, context)
    config = {
        "configurable": {"thread_id": thread_id or f"thread-{datetime.utcnow().timestamp()}"},
        "recursion_limit": MAX_RECURSION,
    }

    try:
        output = graph.invoke(state, config=config)
    except Exception as e:
        logger.error(f"Graph invocation failed: {e}")
        return {
            "task":     task,
            "response": f"Agent encountered an error: {e}. Please try again.",
            "error":    str(e),
            "ts":       datetime.utcnow().isoformat(),
        }

    final_response = ""
    agents_used    = []
    for msg in reversed(output.get("messages", [])):
        if hasattr(msg, "content") and msg.content:
            if not final_response:
                final_response = msg.content
            if msg.content.startswith("["):
                bracket_end = msg.content.find("]")
                if bracket_end > 0:
                    agent_name = msg.content[1:bracket_end]
                    if agent_name not in agents_used:
                        agents_used.append(agent_name)

    return {
        "task":         task,
        "response":     final_response or "Task complete.",
        "agents_used":  list(reversed(agents_used)),
        "iterations":   output.get("recursion_count", 0),
        "tool_results": output.get("tool_results", []),
        "error_log":    output.get("error_log", []),
        "ts":           datetime.utcnow().isoformat(),
        "demo":         DEMO_MODE,
    }


class AgentRunIn(BaseModel):
    task:      str
    context:   dict = {}
    thread_id: str  = ""


class ScheduledTaskIn(BaseModel):
    trigger: str


@router.post("/run")
async def run_agent(body: AgentRunIn):
    """Run the multi-agent supervisor with a free-text task."""
    return await invoke_graph(
        task=body.task,
        context=body.context,
        thread_id=body.thread_id or None,
    )


@router.post("/scheduled")
async def run_scheduled(body: ScheduledTaskIn):
    """Run a predefined scheduled task by name."""
    task = _SCHEDULED_TASKS.get(body.trigger, body.trigger)
    return await invoke_graph(task=task, context={"trigger": body.trigger})


@router.get("/donors/top")
async def get_top_donors(n: int = 5):
    """Direct donor list — no agent, no LLM cost."""
    donors = [
        {"rank": 1, "donor_id": "d001", "name": "Ramesh Kumar",
         "blood_group": "B+", "compat_score": 0.97, "churn_risk": 0.12,
         "language": "hi", "status": "active", "city": "Hyderabad"},
        {"rank": 2, "donor_id": "d002", "name": "Priya Sharma",
         "blood_group": "O+", "compat_score": 0.93, "churn_risk": 0.08,
         "language": "hi", "status": "active"},
        {"rank": 3, "donor_id": "d003", "name": "Vijay Reddy",
         "blood_group": "B+", "compat_score": 0.91, "churn_risk": 0.71,
         "language": "te", "status": "at_risk",
         "flag": "HIGH CHURN — switch to voice"},
        {"rank": 4, "donor_id": "d004", "name": "Ananya Iyer",
         "blood_group": "A+", "compat_score": 0.89, "churn_risk": 0.22,
         "language": "ta", "status": "active"},
        {"rank": 5, "donor_id": "d005", "name": "Suresh Patel",
         "blood_group": "O+", "compat_score": 0.87, "churn_risk": 0.35,
         "language": "hi", "status": "active"},
    ]
    return {
        "top_donors":      donors[:n],
        "total_in_system": 786,
        "source":          "Blood Warriors dataset",
        "ts":              datetime.utcnow().isoformat(),
    }


@router.get("/donors/at-risk")
async def get_at_risk_donors():
    """Direct at-risk donors — no agent, no LLM cost."""
    return {
        "at_risk_donors": [
            {"name": "Vijay Reddy",  "churn_risk": 0.71, "language": "te",
             "action": "switch_to_voice", "calls_made": 3},
            {"name": "Arun Mehta",   "churn_risk": 0.55, "language": "hi",
             "action": "resend_whatsapp_different_slot", "calls_made": 2},
            {"name": "Rekha Pillai", "churn_risk": 0.41, "language": "ml",
             "action": "resend_whatsapp_different_slot", "calls_made": 1},
        ],
        "total_at_risk": 146,
        "model_auc":     0.9990,
        "ts":            datetime.utcnow().isoformat(),
    }


@router.get("/graph/info")
async def graph_info():
    """Graph structure for debugging and LangSmith verification."""
    return {
        "pattern":         "LangGraph Supervisor + 3 Specialists",
        "nodes":           ["supervisor", "matching_agent", "prediction_agent",
                            "outreach_agent", "finish"],
        "recursion_limit": MAX_RECURSION,
        "checkpointer":    "postgres" if os.getenv("POSTGRES_CHECKPOINTING") == "true"
                           else "memory",
        "demo_mode":       DEMO_MODE,
        "langsmith":       os.getenv("LANGCHAIN_TRACING_V2", "false"),
        "models": {
            "supervisor":       "nova-micro ($0.035/M — routing only)",
            "matching_agent":   "nova-micro",
            "prediction_agent": "nova-micro",
            "outreach_agent":   "nova-lite ($0.060/M — multilingual generation)",
        },
        "tools_per_agent": {
            "matching_agent":   ["match_donors", "search_donor_by_id", "get_urgency_summary"],
            "prediction_agent": ["score_churn_risk", "run_conversion_scoring", "get_donor_context"],
            "outreach_agent":   ["send_outreach", "generate_story", "log_failure"],
        },
    }


@router.get("/status")
async def agent_status():
    return {
        "status":    "ready",
        "pattern":   "LangGraph supervisor + 3 specialists",
        "demo_mode": DEMO_MODE,
        "ts":        datetime.utcnow().isoformat(),
    }
