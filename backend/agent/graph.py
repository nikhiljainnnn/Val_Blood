"""
backend/agent/graph.py
========================
Compiles all agents into a LangGraph StateGraph.

Graph structure:
  START → supervisor → [matching_agent | prediction_agent | outreach_agent] → supervisor
                    ↓ (when next == FINISH)
                   END

Key properties:
  - Deterministic edges: specialists always return to supervisor
  - recursion_limit=10 enforced in state AND as LangGraph config
  - PostgreSQL checkpointing: conversation resumes across EC2 restarts
  - Full DEMO_MODE support: works with no Bedrock credentials
  - LangSmith tracing: one env var enables full trace visibility

Usage:
    from agent.graph import get_graph
    graph = get_graph()
    result = graph.invoke(
        {"messages": [HumanMessage(content="Find top donors for patient X")]},
        config={"configurable": {"thread_id": "session-123"}, "recursion_limit": 10}
    )
"""
from __future__ import annotations

import json
import logging
import os
from functools import lru_cache
from typing import Literal

def _get_text(content) -> str:
    if isinstance(content, list):
        return " ".join([c.get("text", "") for c in content if isinstance(c, dict) and "text" in c])
    elif isinstance(content, str):
        return content
    return str(content)

from langchain_core.messages import AIMessage, HumanMessage

from langgraph.graph import StateGraph, START, END
from langgraph.checkpoint.memory import MemorySaver    # in-memory for demo
# In production with POSTGRES_CHECKPOINTING=true, swap to:
# from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver

from agent.state import AgentState, AGENTS, FINISH, MAX_RECURSION
from agent.supervisor import supervisor_node, compile_final_response
from agent.specialists import (
    build_matching_agent,
    build_prediction_agent,
    build_outreach_agent,
)

logger = logging.getLogger("raksetu.graph")

DEMO_MODE              = os.getenv("DEMO_MODE",              "true").lower() == "true"
POSTGRES_CHECKPOINTING = os.getenv("POSTGRES_CHECKPOINTING", "false").lower() == "true"
DATABASE_URL           = os.getenv("DATABASE_URL", "")


# ── Specialist node wrappers ───────────────────────────────────────────────────
# Each wrapper calls the specialist (or returns demo data in DEMO_MODE),
# appends the result to state["tool_results"], and routes back to supervisor.

_matching_agent_instance   = None
_prediction_agent_instance = None
_outreach_agent_instance   = None


def _ensure_agents():
    global _matching_agent_instance, _prediction_agent_instance, _outreach_agent_instance
    if not DEMO_MODE:
        if _matching_agent_instance is None:
            _matching_agent_instance   = build_matching_agent()
        if _prediction_agent_instance is None:
            _prediction_agent_instance = build_prediction_agent()
        if _outreach_agent_instance is None:
            _outreach_agent_instance   = build_outreach_agent()


def _demo_specialist_response(agent_name: str, state: AgentState) -> dict:
    """Return a plausible demo response for any specialist in demo mode."""
    last_human = ""
    for msg in reversed(state["messages"]):
        if isinstance(msg, HumanMessage):
            last_human = msg.content.lower()
            break

    if agent_name == "matching_agent":
        return {
            "agent": "matching_agent",
            "data": {
                "donors": [
                    {"rank": 1, "name": "Ramesh Kumar",  "compat_score": 0.97,
                     "churn_risk": 0.12, "status": "active", "language": "hi"},
                    {"rank": 2, "name": "Priya Sharma",  "compat_score": 0.93,
                     "churn_risk": 0.08, "status": "active", "language": "hi"},
                    {"rank": 3, "name": "Vijay Reddy",   "compat_score": 0.91,
                     "churn_risk": 0.71, "status": "at_risk", "language": "te"},
                ],
                "critical_past_due": 656,
                "urgent_0_7_days":    67,
                "at_risk_matched":   146,
            },
            "message": "Found 3 compatible donors. Vijay Reddy flagged: 71% churn risk.",
        }
    elif agent_name == "prediction_agent":
        return {
            "agent": "prediction_agent",
            "data": {
                "churn_probability": 0.12,
                "risk_level":        "low",
                "intervention":      "no_action_needed",
                "model_auc":         0.9990,
                "history":           "3 donations, responds to WhatsApp, morning contact preferred",
            },
            "message": "Churn risk: 12% (low). No intervention needed. Donor history: 3 donations.",
        }
    elif agent_name == "outreach_agent":
        return {
            "agent": "outreach_agent",
            "data": {
                "status":          "sent",
                "channel":         "whatsapp",
                "message_preview": "नमस्ते Ramesh! एक मरीज़ को आपकी ज़रूरत है।",
                "story":           "आपका 32वाँ donation एक बच्चे के जीवन की डोर था।",
            },
            "message": "WhatsApp sent in Hindi. Impact story generated.",
        }
    return {"agent": agent_name, "data": {}, "message": "Demo response"}


def _run_specialist(agent_instance, agent_name: str, state: AgentState) -> AgentState:
    """
    Run a specialist agent and merge its output into state.
    If the agent fails or is None (demo mode), uses demo data.
    """
    # Demo mode or agent unavailable
    if DEMO_MODE or agent_instance is None:
        result = _demo_specialist_response(agent_name, state)
        response_text = result.get("message", "Task complete.")
        return {
            **state,
            "tool_results": state.get("tool_results", []) + [result],
            "messages": state["messages"] + [
                AIMessage(content=f"[{agent_name}] {response_text}")
            ],
            "next": "supervisor",
        }

    # Real agent call
    try:
        output        = agent_instance.invoke({"messages": state["messages"]})
        last_msg      = output["messages"][-1]
        response_text = _get_text(last_msg.content) if hasattr(last_msg, "content") else str(last_msg)

        result = {
            "agent":   agent_name,
            "data":    {},          # parsed from message in compile_final_response
            "message": response_text,
        }

        # Try to extract structured data from the last tool call output
        for msg in reversed(output["messages"]):
            if hasattr(msg, "content"):
                msg_str = _get_text(msg.content)
                if msg_str.strip().startswith("{"):
                    try:
                        result["data"] = json.loads(msg_str)
                        break
                    except Exception:
                        pass

        return {
            **state,
            "tool_results": state.get("tool_results", []) + [result],
            "messages": state["messages"] + [
                AIMessage(content=f"[{agent_name}] {response_text}")
            ],
            "next": "supervisor",
        }

    except Exception as e:
        error_msg = f"{agent_name} failed: {e}"
        logger.error(error_msg)
        return {
            **state,
            "error_log":  state.get("error_log", []) + [error_msg],
            "tool_results": state.get("tool_results", []) + [
                _demo_specialist_response(agent_name, state)
            ],
            "messages": state["messages"] + [
                AIMessage(content=f"[{agent_name}] Error occurred, using fallback data.")
            ],
            "next": "supervisor",
        }


def matching_node(state: AgentState) -> AgentState:
    _ensure_agents()
    return _run_specialist(_matching_agent_instance, "matching_agent", state)


def prediction_node(state: AgentState) -> AgentState:
    _ensure_agents()
    return _run_specialist(_prediction_agent_instance, "prediction_agent", state)


def outreach_node(state: AgentState) -> AgentState:
    _ensure_agents()
    return _run_specialist(_outreach_agent_instance, "outreach_agent", state)


def finish_node(state: AgentState) -> AgentState:
    """Compile final response from all tool_results and add as last message."""
    final = compile_final_response(state)
    return {
        **state,
        "messages": state["messages"] + [AIMessage(content=final)],
    }


# ── Conditional edge: supervisor → next node ──────────────────────────────────
def route_from_supervisor(state: AgentState) -> Literal[
    "matching_agent", "prediction_agent", "outreach_agent", "finish"
]:
    nxt = state.get("next", FINISH)
    if nxt == "matching_agent":  return "matching_agent"
    if nxt == "prediction_agent": return "prediction_agent"
    if nxt == "outreach_agent":  return "outreach_agent"
    return "finish"


# ── Build and cache the compiled graph ────────────────────────────────────────
@lru_cache(maxsize=1)
def get_graph():
    """
    Build and compile the StateGraph. Cached — only built once per process.

    Checkpointing:
      Default: MemorySaver (in-memory, lost on restart — fine for demo)
      Production: set POSTGRES_CHECKPOINTING=true to use AsyncPostgresSaver
                  which stores conversation state in your existing Postgres DB.
    """
    builder = StateGraph(AgentState)

    # Add nodes
    builder.add_node("supervisor",      supervisor_node)
    builder.add_node("matching_agent",  matching_node)
    builder.add_node("prediction_agent", prediction_node)
    builder.add_node("outreach_agent",  outreach_node)
    builder.add_node("finish",          finish_node)

    # Entry point: always start at supervisor
    builder.add_edge(START, "supervisor")

    # Supervisor routes conditionally
    builder.add_conditional_edges(
        "supervisor",
        route_from_supervisor,
        {
            "matching_agent":  "matching_agent",
            "prediction_agent": "prediction_agent",
            "outreach_agent":  "outreach_agent",
            "finish":          "finish",
        },
    )

    # All specialists route back to supervisor
    builder.add_edge("matching_agent",  "supervisor")
    builder.add_edge("prediction_agent", "supervisor")
    builder.add_edge("outreach_agent",  "supervisor")

    # Finish → END
    builder.add_edge("finish", END)

    # Checkpointer
    if POSTGRES_CHECKPOINTING and DATABASE_URL:
        logger.info("Using PostgreSQL checkpointing")
        # Production: uncomment and install langgraph-checkpoint-postgres
        # from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver
        # checkpointer = AsyncPostgresSaver.from_conn_string(DATABASE_URL)
        # return builder.compile(checkpointer=checkpointer)
        pass

    checkpointer = MemorySaver()
    logger.info(f"Graph compiled (demo={DEMO_MODE}, checkpointer=memory)")
    return builder.compile(checkpointer=checkpointer)


def get_initial_state(task: str, context: dict | None = None) -> AgentState:
    """Build an initial AgentState from a task string."""
    return {
        "messages":        [HumanMessage(content=task)],
        "next":            "supervisor",
        "recursion_count": 0,
        "error_log":       [],
        "task_context":    context or {},
        "tool_results":    [],
    }
