"""
backend/agent/supervisor.py
=============================
Supervisor agent — uses Nova Micro (cheapest, $0.035/M tokens) because
routing is a simple classification task. The supervisor only needs to
output one of: matching_agent / prediction_agent / outreach_agent / FINISH.

Responsibilities:
  1. Parse the user's request and populate task_context
  2. Decide which specialist to route to next
  3. After each specialist returns, decide: route to another OR FINISH
  4. Compile the final response from tool_results

The supervisor does NOT call any tools directly — that is the specialists' job.
This separation is the core fix for the monolithic orchestrator's failures.
"""
from __future__ import annotations

import json
import logging
import os
from datetime import datetime

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from langchain_aws import ChatBedrockConverse

from agent.state import AgentState, AGENTS, FINISH, MAX_RECURSION, TaskContext

logger = logging.getLogger("raksetu.supervisor")

DEMO_MODE   = os.getenv("DEMO_MODE",   "true").lower() == "true"
AWS_REGION  = os.getenv("AWS_REGION",  "us-east-1")
MICRO_MODEL = os.getenv("BEDROCK_MICRO_MODEL_ID", "amazon.nova-micro-v1:0")

# ── Supervisor system prompt ───────────────────────────────────────────────────
_SUPERVISOR_PROMPT = """You are the Supervisor for RakSetu, a blood donation coordination system.

You coordinate three specialist agents. Your ONLY job is to route tasks.

SPECIALISTS:
- matching_agent   → find donors for patients, blood group matching, urgency alerts
- prediction_agent → churn risk scoring, donor context/history, conversion candidates
- outreach_agent   → send WhatsApp/SMS/voice, generate impact stories, log failures

ROUTING RULES:
1. "top donors" / "list donors" / "match donor" → matching_agent
2. "churn risk" / "score" / "conversion" / "history" → prediction_agent
3. "send message" / "outreach" / "story" / "notification" → outreach_agent
4. Complex tasks (e.g. find donor + check risk + send message) → route to each in sequence
5. After ALL needed specialists have responded → FINISH

OUTPUT FORMAT — respond with ONLY ONE of these exact strings:
matching_agent
prediction_agent
outreach_agent
FINISH

Nothing else. No explanation. No JSON. Just the routing decision."""

# ── Demo routing logic (no Bedrock call needed) ────────────────────────────────
_ROUTING_KEYWORDS = {
    "matching_agent":   ["donor", "match", "patient", "blood", "urgent", "alert",
                         "compatible", "circle", "guardian", "list", "top", "find"],
    "prediction_agent": ["churn", "risk", "score", "convert", "conversion",
                         "history", "context", "predict", "probability"],
    "outreach_agent":   ["send", "message", "outreach", "story", "notify",
                         "whatsapp", "sms", "voice", "contact", "call", "failure", "campaign"],
}


def _demo_route(state: AgentState) -> str:
    """Simple keyword-based routing for demo mode. Fast, deterministic, free."""
    last_human = ""
    for msg in reversed(state["messages"]):
        if isinstance(msg, HumanMessage):
            last_human = msg.content.lower()
            break

    # If we have tool_results already, check if we need another specialist
    existing_agents = {
        r.get("agent") for r in state.get("tool_results", []) if "agent" in r
    }

    # Detect complex tasks that need sequencing
    needs_prediction = any(k in last_human for k in ["churn", "risk", "score"])
    needs_outreach   = any(k in last_human for k in _ROUTING_KEYWORDS["outreach_agent"])
    needs_matching   = any(k in last_human for k in _ROUTING_KEYWORDS["matching_agent"])

    if needs_matching and "matching_agent" not in existing_agents:
        return "matching_agent"
    if needs_prediction and "prediction_agent" not in existing_agents:
        return "prediction_agent"
    if needs_outreach and "outreach_agent" not in existing_agents:
        return "outreach_agent"

    # Default: route to best single agent based on keywords
    scores = {}
    for agent, keywords in _ROUTING_KEYWORDS.items():
        scores[agent] = sum(1 for k in keywords if k in last_human)

    best = max(scores, key=lambda a: scores[a])
    if best in existing_agents:
        return FINISH
    if scores[best] == 0:
        if "matching_agent" in existing_agents:
            return FINISH
        return "matching_agent"   # sensible default
    return best


# ── LLM-based routing (used when DEMO_MODE=false) ─────────────────────────────
_llm_cache = None


def _get_llm():
    global _llm_cache
    if _llm_cache is not None:
        return _llm_cache
    try:
        _llm_cache = ChatBedrockConverse(
            model=MICRO_MODEL,
            region_name=AWS_REGION,
            temperature=0.0,    # deterministic routing
            max_tokens=20,      # only need one word back
        )
        return _llm_cache
    except Exception as e:
        logger.error(f"Supervisor LLM init failed: {e}")
        return None


def _extract_task_context(state: AgentState) -> TaskContext:
    """
    Extract structured fields from the latest human message.
    Used to populate state.task_context on the first supervisor turn.
    """
    ctx: TaskContext = {
        "urgency":  "normal",
        "language": "hi",
    }
    last_human = ""
    for msg in reversed(state["messages"]):
        if isinstance(msg, HumanMessage):
            last_human = msg.content.lower()
            break

    # Simple keyword extraction — good enough for demo and most prod queries
    if "critical" in last_human or "emergency" in last_human:
        ctx["urgency"] = "critical"
    elif "urgent" in last_human or "immediate" in last_human:
        ctx["urgency"] = "urgent"

    for lang in ["hindi", "telugu", "tamil", "bengali", "english", "marathi"]:
        if lang in last_human:
            ctx["language"] = {
                "hindi": "hi", "telugu": "te", "tamil": "ta",
                "bengali": "bn", "english": "en", "marathi": "mr",
            }[lang]
            break

    if "demo-patient" in last_human or "patient" not in last_human:
        ctx["patient_id"] = "demo-patient-001"

    return ctx


# ── Supervisor node function ───────────────────────────────────────────────────
def supervisor_node(state: AgentState) -> AgentState:
    """
    LangGraph node function for the supervisor.
    Called on every supervisor turn. Updates state["next"] and state["recursion_count"].
    """
    # ── Safety check ─────────────────────────────────────────────────────────
    count = state.get("recursion_count", 0) + 1
    if count >= MAX_RECURSION:
        logger.warning(f"Supervisor hit recursion limit ({MAX_RECURSION}). Forcing FINISH.")
        return {
            **state,
            "next": FINISH,
            "recursion_count": count,
            "messages": state["messages"] + [
                AIMessage(content=(
                    f"Task partially complete. Reached maximum iterations ({MAX_RECURSION}). "
                    f"Results collected: {len(state.get('tool_results', []))}"
                ))
            ],
        }

    # ── Populate task_context on first turn ──────────────────────────────────
    task_ctx = state.get("task_context") or _extract_task_context(state)

    # ── Route ─────────────────────────────────────────────────────────────────
    if DEMO_MODE:
        next_agent = _demo_route(state)
    else:
        llm = _get_llm()
        if llm is None:
            next_agent = _demo_route(state)
        else:
            try:
                history_summary = "\n".join(
                    f"{m.__class__.__name__}: {m.content[:120]}"
                    for m in state["messages"][-6:]   # last 3 turns
                )
                results_summary = json.dumps(state.get("tool_results", [])[-3:])
                prompt = (
                    f"Conversation:\n{history_summary}\n\n"
                    f"Results so far:\n{results_summary}\n\n"
                    "Next routing decision:"
                )
                response = llm.invoke([
                    SystemMessage(content=_SUPERVISOR_PROMPT),
                    HumanMessage(content=prompt),
                ])
                content_str = response.content
                if isinstance(content_str, list):
                    content_str = " ".join([c.get("text", "") for c in content_str if isinstance(c, dict) and "text" in c])
                elif not isinstance(content_str, str):
                    content_str = str(content_str)
                decision = content_str.strip().lower()
                next_agent = decision if decision in (AGENTS + [FINISH]) else _demo_route(state)
            except Exception as e:
                logger.error(f"Supervisor LLM call failed: {e}. Falling back to keyword routing.")
                next_agent = _demo_route(state)

    logger.info(f"Supervisor → {next_agent} (iter {count}/{MAX_RECURSION})")

    return {
        **state,
        "next":            next_agent,
        "recursion_count": count,
        "task_context":    task_ctx,
    }


def compile_final_response(state: AgentState) -> str:
    """
    Build a human-readable final response from accumulated tool_results.
    Called by the graph when supervisor routes to FINISH.
    """
    results = state.get("tool_results", [])
    errors  = state.get("error_log", [])
    parts   = []

    for r in results:
        agent = r.get("agent", "agent")
        data  = r.get("data", {})

        if agent == "matching_agent":
            donors = data.get("donors", [])
            if donors:
                lines = [f"Top {len(donors)} matched donors:"]
                for d in donors:
                    risk_flag = " ⚠ HIGH CHURN RISK" if d.get("churn_risk", 0) > 0.6 else ""
                    lines.append(
                        f"  {d['rank']}. {d['name']} — {d.get('compat_score', 0)*100:.0f}% "
                        f"compat, churn {d.get('churn_risk', 0)*100:.0f}%{risk_flag}"
                    )
                parts.append("\n".join(lines))
            urgency = data.get("critical_past_due")
            if urgency:
                parts.append(
                    f"Urgency: {urgency} past-due, {data.get('urgent_0_7_days', 0)} "
                    f"urgent in 7 days, {data.get('at_risk_matched', 0)} at-risk matched donors."
                )

        elif agent == "prediction_agent":
            prob = data.get("churn_probability")
            if prob is not None:
                level = data.get("risk_level", "unknown")
                action = data.get("intervention", "—")
                parts.append(f"Churn risk: {prob*100:.1f}% ({level}) — recommended: {action}")
            top = data.get("top_probability")
            if top:
                parts.append(
                    f"Conversion model: {data.get('candidates_scored', 0):,} scored, "
                    f"top probability {top:.3f} (AUC {data.get('model_auc', 0):.4f})"
                )

        elif agent == "outreach_agent":
            if data.get("status") == "sent":
                parts.append(
                    f"Outreach sent via {data.get('channel', 'whatsapp')}: "
                    f"\"{data.get('message_preview', '')}\""
                )
            story = data.get("story")
            if story:
                parts.append(f"Impact story generated: \"{story[:100]}...\"")
            if data.get("logged"):
                parts.append(f"Failure logged. Next action: {data.get('next_action', '—')}")

    if errors:
        parts.append(f"\n⚠ Errors: {'; '.join(errors)}")

    if not parts:
        # If no structured data was returned, let's at least show the conversational messages from the agents!
        fallback_msgs = [f"[{r.get('agent')}] {r.get('message')}" for r in results if r.get("message")]
        if fallback_msgs:
            return "No structured data. Agent replies:\n" + "\n".join(fallback_msgs)
        return "Task complete. No structured results returned."

    return "\n\n".join(parts)
