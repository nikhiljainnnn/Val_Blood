"""
backend/agent/state.py
======================
Shared state that flows through every node in the LangGraph.
All agents read from and write to this single TypedDict.

Key fields:
  messages        — full conversation (HumanMessage / AIMessage / ToolMessage)
  next            — which agent the supervisor routes to next (or "FINISH")
  recursion_count — incremented each supervisor turn; graph halts at MAX_RECURSION
  error_log       — each tool failure appended here; surfaced in final response
  task_context    — structured data the supervisor extracts from the user's request
                    (patient_id, donor_id, urgency, language)
  tool_results    — raw specialist outputs collected across the run
"""
from __future__ import annotations

from typing import Annotated, Any
from typing_extensions import TypedDict

from langchain_core.messages import AnyMessage
from langgraph.graph.message import add_messages

# Maximum supervisor iterations before the graph force-terminates.
# Prevents the infinite-loop bug we saw in the monolithic orchestrator.
MAX_RECURSION = 10

# Possible values for state["next"]
AGENTS     = ["matching_agent", "prediction_agent", "outreach_agent"]
FINISH     = "FINISH"
SUPERVISOR = "supervisor"


class TaskContext(TypedDict, total=False):
    """Structured fields the supervisor extracts from the user's request."""
    patient_id:  str
    donor_id:    str
    blood_group: str
    urgency:     str          # "normal" | "urgent" | "critical"
    language:    str          # "hi" | "te" | "ta" | "en" | ...
    city:        str


class AgentState(TypedDict):
    # ── Conversation history ──────────────────────────────────────────────────
    # add_messages reducer: new messages are appended, not replaced.
    messages: Annotated[list[AnyMessage], add_messages]

    # ── Routing ───────────────────────────────────────────────────────────────
    # Set by supervisor on every turn. Graph reads this to pick the next node.
    next: str                        # one of AGENTS | FINISH | SUPERVISOR

    # ── Safety ────────────────────────────────────────────────────────────────
    # Prevents infinite loops. Graph checks this before every supervisor turn.
    recursion_count: int

    # ── Debugging ─────────────────────────────────────────────────────────────
    # Every tool error is appended here. Surfaced in the final response so
    # the user (and LangSmith trace) can see what failed and why.
    error_log: list[str]

    # ── Structured task data ──────────────────────────────────────────────────
    # Populated by supervisor on first turn. Passed to specialists so they
    # don't have to re-parse the user's message.
    task_context: TaskContext

    # ── Accumulated specialist outputs ────────────────────────────────────────
    # Each specialist appends its result. Supervisor uses these to decide
    # whether to route to another specialist or FINISH.
    tool_results: list[dict[str, Any]]
