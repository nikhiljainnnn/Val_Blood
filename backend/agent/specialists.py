"""
backend/agent/specialists.py
==============================
Three specialist agents. Each has max 3 tools — the core fix for
the "tool selection paralysis" that caused infinite loops in the
monolithic orchestrator.

MatchingAgent    — match_donors, search_donor_by_id, get_urgency_summary
PredictionAgent  — score_churn_risk, run_conversion_scoring, get_donor_context
OutreachAgent    — send_outreach, generate_story, log_failure

Tools call the existing FastAPI microservices via HTTP.
In DEMO_MODE=true all tools return rich realistic data with no network calls.

Each specialist is created with create_react_agent from langgraph.prebuilt.
The supervisor calls them as sub-graphs and reads their final AIMessage.
"""
from __future__ import annotations

import json
import logging
import os
from datetime import datetime
from typing import Any

import httpx
from langchain_core.tools import tool
from langchain_aws import ChatBedrockConverse
from langgraph.prebuilt import create_react_agent

from agent.state import AgentState

logger = logging.getLogger("raksetu.specialists")

# ── Config ────────────────────────────────────────────────────────────────────
DEMO_MODE  = os.getenv("DEMO_MODE",   "true").lower() == "true"
AWS_REGION = os.getenv("AWS_REGION",  "us-east-1")

# Nova Micro for Matching + Prediction (no text generation needed — just structured output)
# Nova Lite for Outreach (needs multilingual message generation)
MICRO_MODEL = os.getenv("BEDROCK_MICRO_MODEL_ID", "amazon.nova-micro-v1:0")
LITE_MODEL  = os.getenv("BEDROCK_LITE_MODEL_ID",  "amazon.nova-lite-v1:0")

# Internal service URLs (match docker-compose.yml)
_SVC = {
    "matching":     os.getenv("MATCHING_URL",     "http://matching-service:8001"),
    "prediction":   os.getenv("PREDICTION_URL",   "http://prediction-service:8002"),
    "notification": os.getenv("NOTIFICATION_URL", "http://notification-service:8003"),
    "story":        os.getenv("STORY_URL",         "http://story-engine:8007"),
}

_REQUEST_TIMEOUT = 12.0


# ── Shared HTTP helper ────────────────────────────────────────────────────────
async def _get(url: str) -> dict:
    async with httpx.AsyncClient(timeout=_REQUEST_TIMEOUT) as c:
        r = await c.get(url)
        r.raise_for_status()
        return r.json()


async def _post(url: str, body: dict) -> dict:
    async with httpx.AsyncClient(timeout=_REQUEST_TIMEOUT) as c:
        r = await c.post(url, json=body)
        r.raise_for_status()
        return r.json()


# ── Demo data (used when DEMO_MODE=true or service call fails) ─────────────────
_DEMO = {
    "match_donors": {
        "status": "success",
        "donors": [
            {"rank": 1, "donor_id": "d001", "name": "Ramesh Kumar",
             "compat_score": 0.97, "churn_risk": 0.12, "language": "hi",
             "status": "active", "phone": "+919876500001", "city": "Hyderabad"},
            {"rank": 2, "donor_id": "d002", "name": "Priya Sharma",
             "compat_score": 0.93, "churn_risk": 0.08, "language": "hi",
             "status": "active", "phone": "+919876500002"},
            {"rank": 3, "donor_id": "d003", "name": "Vijay Reddy",
             "compat_score": 0.91, "churn_risk": 0.71, "language": "te",
             "status": "at_risk", "flag": "HIGH CHURN — switch to voice"},
        ],
        "total_matched": 3,
    },
    "search_donor_by_id": {
        "donor_id": "d001", "name": "Ramesh Kumar",
        "blood_group": "B Positive", "churn_risk": 0.12,
        "language": "hi", "city": "Hyderabad",
        "lifetime_donations": 32, "status": "active",
    },
    "get_urgency_summary": {
        "critical_past_due": 656, "urgent_0_7_days": 67,
        "high_8_14_days": 28,    "normal_15_30_days": 35,
        "at_risk_matched": 146,  "source": "Blood Warriors dataset",
    },
    "score_churn_risk": {
        "churn_probability": 0.12, "risk_level": "low",
        "intervention": "no_action_needed", "model_auc": 0.9990,
    },
    "run_conversion_scoring": {
        "candidates_scored": 2385, "top_probability": 0.921,
        "model_auc": 0.9214,
        "impact": "churn drops 22.4% → 6.9% after bridge assignment",
    },
    "get_donor_context": {
        "total_events": 7, "donations_completed": 3,
        "last_event_type": "donation_completed",
        "last_event_content": "1 unit B+ donated 20 Aug 2025",
        "history": "3 donations, responds well to WhatsApp, prefers morning",
    },
    "send_outreach": {
        "status": "sent", "channel": "whatsapp",
        "message_preview": "नमस्ते Ramesh! एक मरीज़ को आपकी ज़रूरत है।",
    },
    "generate_story": {
        "story": (
            "आपका 32वाँ donation एक 9 साल के बच्चे के लिए था जो "
            "पिछले हफ्ते पहली बार स्कूल में पहला नंबर आया।"
        ),
        "language": "hi", "model": "nova-lite",
    },
    "log_failure": {
        "next_action": "switch_to_sms", "wait_hours": 6,
        "strategy": "channel_switch", "logged": True,
    },
}


def _demo_or_error(tool_name: str, override: dict | None = None) -> str:
    """Return demo data as JSON string, merging any override values."""
    data = {**_DEMO.get(tool_name, {}), **(override or {}), "demo": True}
    return json.dumps(data)


# ═══════════════════════════════════════════════════════════════════════════════
# MATCHING AGENT — 3 tools
# ═══════════════════════════════════════════════════════════════════════════════

@tool
async def match_donors(patient_id: str, blood_group: str = "",
                       urgency: str = "normal", top_n: int = 5) -> str:
    """
    Find the best compatible blood donors for a patient.
    Returns ranked list with compatibility scores and churn risk.
    Always call this with patient_id. Use 'demo-patient-001' if unknown.
    """
    if DEMO_MODE:
        return _demo_or_error("match_donors", {"patient_id": patient_id, "urgency": urgency})
    try:
        data = await _post(
            f"{_SVC['matching']}/guardian-circle/build/{patient_id}",
            {"urgency": urgency, "top_n": top_n},
        )
        return json.dumps(data)
    except Exception as e:
        logger.error(f"match_donors failed: {e}")
        return _demo_or_error("match_donors", {"patient_id": patient_id, "error": str(e)})


@tool
async def search_donor_by_id(donor_id: str) -> str:
    """
    Look up a specific donor's profile, blood group, and current status.
    Use when you already know the donor_id.
    """
    if DEMO_MODE:
        return _demo_or_error("search_donor_by_id", {"donor_id": donor_id})
    try:
        data = await _get(f"{_SVC['matching']}/donor/{donor_id}")
        return json.dumps(data)
    except Exception as e:
        logger.error(f"search_donor_by_id failed: {e}")
        return _demo_or_error("search_donor_by_id", {"donor_id": donor_id})


@tool
async def get_urgency_summary() -> str:
    """
    Get current transfusion urgency breakdown:
    past-due count, 7-day urgent, 8-14 day high, 15+ normal.
    Call this first for any 'alerts' or 'urgent patients' query.
    """
    if DEMO_MODE:
        return _demo_or_error("get_urgency_summary")
    try:
        data = await _get(f"{_SVC['matching']}/alerts/summary")
        return json.dumps(data)
    except Exception as e:
        logger.error(f"get_urgency_summary failed: {e}")
        return _demo_or_error("get_urgency_summary")


# ═══════════════════════════════════════════════════════════════════════════════
# PREDICTION AGENT — 3 tools
# ═══════════════════════════════════════════════════════════════════════════════

@tool
async def score_churn_risk(donor_id: str) -> str:
    """
    Score a donor's churn probability using the XGBoost model (AUC 0.9990).
    Returns probability 0-1, risk level, and recommended intervention.
    Always call this BEFORE send_outreach to check donor availability.
    """
    if DEMO_MODE:
        return _demo_or_error("score_churn_risk", {"donor_id": donor_id})
    try:
        data = await _get(f"{_SVC['prediction']}/churn/donor/{donor_id}")
        return json.dumps(data)
    except Exception as e:
        logger.error(f"score_churn_risk failed: {e}")
        return _demo_or_error("score_churn_risk", {"donor_id": donor_id})


@tool
async def run_conversion_scoring(top_n: int = 50) -> str:
    """
    Score all one-time donors for conversion to regular bridge donors.
    Uses GradientBoosting model (AUC 0.9214).
    Returns top N candidates ranked by conversion probability.
    Only call when user explicitly asks about conversion or bridge assignment.
    """
    if DEMO_MODE:
        return _demo_or_error("run_conversion_scoring", {"top_n": top_n})
    try:
        data = await _get(f"{_SVC['prediction']}/conversion/candidates?top_n={top_n}")
        return json.dumps(data)
    except Exception as e:
        logger.error(f"run_conversion_scoring failed: {e}")
        return _demo_or_error("run_conversion_scoring")


@tool
async def get_donor_context(donor_id: str) -> str:
    """
    Retrieve a donor's full interaction history and conversation memory.
    Returns last 10 interactions, donation count, preferred contact channel.
    Call this before generate_story or send_outreach to personalise the message.
    """
    if DEMO_MODE:
        return _demo_or_error("get_donor_context", {"donor_id": donor_id})
    try:
        data = await _get(f"{_SVC['prediction']}/donor/context/{donor_id}")
        return json.dumps(data)
    except Exception as e:
        logger.error(f"get_donor_context failed: {e}")
        return _demo_or_error("get_donor_context", {"donor_id": donor_id})


# ═══════════════════════════════════════════════════════════════════════════════
# OUTREACH AGENT — 3 tools
# ═══════════════════════════════════════════════════════════════════════════════

@tool
async def send_outreach(donor_id: str, phone: str, message: str,
                        channel: str = "whatsapp", language: str = "hi",
                        urgency: str = "normal") -> str:
    """
    Send a personalised message to a donor via WhatsApp, SMS, or voice.
    Always provide: donor_id, phone, and message.
    channel options: 'whatsapp' (default), 'sms', 'voice'.
    """
    if DEMO_MODE:
        return _demo_or_error("send_outreach", {
            "donor_id": donor_id, "channel": channel, "language": language,
        })
    try:
        data = await _post(f"{_SVC['notification']}/notify/donor", {
            "donor_id": donor_id, "phone": phone, "message": message,
            "channel": channel, "urgency": urgency, "language": language,
        })
        return json.dumps(data)
    except Exception as e:
        logger.error(f"send_outreach failed: {e}")
        return _demo_or_error("send_outreach", {"donor_id": donor_id, "error": str(e)})


@tool
async def generate_story(donor_id: str, patient_id: str,
                         language: str = "hi") -> str:
    """
    Generate a personalised patient impact story for a donor using Bedrock Nova Lite.
    Story is in the donor's preferred language and references their donation history.
    Always call get_donor_context first to get the donor's language preference.
    """
    if DEMO_MODE:
        return _demo_or_error("generate_story", {
            "donor_id": donor_id, "patient_id": patient_id, "language": language,
        })
    try:
        data = await _get(
            f"{_SVC['story']}/story/{donor_id}/{patient_id}?language={language}"
        )
        return json.dumps(data)
    except Exception as e:
        logger.error(f"generate_story failed: {e}")
        return _demo_or_error("generate_story", {"donor_id": donor_id})


@tool
async def log_failure(donor_id: str, calls_attempted: int,
                      days_inactive: int = 0,
                      trigger_comment: str = "",
                      language: str = "hi") -> str:
    """
    Log an outreach failure to the self-improving failure learning system.
    Returns the recommended next protocol (e.g. switch_to_sms, initiate_voice_call).
    Always call this when a donor does not respond after an outreach attempt.
    """
    if DEMO_MODE:
        action = (
            "initiate_voice_call" if calls_attempted >= 3
            else "switch_to_sms" if calls_attempted >= 2
            else "resend_whatsapp_different_slot"
        )
        return _demo_or_error("log_failure", {
            "donor_id": donor_id,
            "next_action": action,
            "calls_attempted": calls_attempted,
        })
    try:
        data = await _post(f"{_SVC['notification']}/notify/failure-learn", {
            "donor_id": donor_id,
            "calls_attempted": calls_attempted,
            "days_since_last_donation": days_inactive,
            "inactive_trigger_comment": trigger_comment,
            "language": language,
        })
        return json.dumps(data)
    except Exception as e:
        logger.error(f"log_failure failed: {e}")
        return _demo_or_error("log_failure", {"donor_id": donor_id})


# ── LLM instances ──────────────────────────────────────────────────────────────
def _make_llm(model_id: str):
    """Create a ChatBedrockConverse instance. Falls back gracefully in demo mode."""
    if DEMO_MODE:
        return None   # specialists handle demo mode in their nodes
    try:
        return ChatBedrockConverse(
            model=model_id,
            region_name=AWS_REGION,
            temperature=0.1,
            max_tokens=800,
        )
    except Exception as e:
        logger.error(f"Failed to create LLM ({model_id}): {e}. Demo mode active.")
        return None


# ── Build specialists ──────────────────────────────────────────────────────────
_MATCHING_SYSTEM = """You are the Matching Specialist for RakSetu Blood Warriors.
Your job: find the best compatible blood donors for patients.
You have exactly 3 tools: match_donors, search_donor_by_id, get_urgency_summary.
Use match_donors for patient-specific matching.
Use get_urgency_summary for alert/urgency queries.
Use search_donor_by_id when a donor_id is already known.
Return a clear, concise summary of your findings."""

_PREDICTION_SYSTEM = """You are the Prediction Specialist for RakSetu Blood Warriors.
Your job: assess donor churn risk and conversion potential.
You have exactly 3 tools: score_churn_risk, run_conversion_scoring, get_donor_context.
Always score_churn_risk before recommending a donor for outreach.
Use get_donor_context to understand a donor's history before the outreach agent contacts them.
Return scores with actionable recommendations."""

_OUTREACH_SYSTEM = """You are the Outreach Specialist for RakSetu Blood Warriors.
Your job: send personalised messages and generate donor impact stories.
You have exactly 3 tools: send_outreach, generate_story, log_failure.
Always check that churn risk is below 0.7 before sending outreach (prediction agent does this).
Use generate_story after a confirmed donation to reinforce the donor's motivation.
Use log_failure after any non-response to feed the self-improving learning system.
Match the donor's language: hi=Hindi, te=Telugu, ta=Tamil, en=English."""


def build_matching_agent():
    llm = _make_llm(MICRO_MODEL)
    if llm is None:
        return None   # graph.py handles None agents in demo mode
    return create_react_agent(
        llm,
        tools=[match_donors, search_donor_by_id, get_urgency_summary],
        state_modifier=_MATCHING_SYSTEM,
    )


def build_prediction_agent():
    llm = _make_llm(MICRO_MODEL)
    if llm is None:
        return None
    return create_react_agent(
        llm,
        tools=[score_churn_risk, run_conversion_scoring, get_donor_context],
        state_modifier=_PREDICTION_SYSTEM,
    )


def build_outreach_agent():
    llm = _make_llm(LITE_MODEL)   # Nova Lite — needs multilingual generation
    if llm is None:
        return None
    return create_react_agent(
        llm,
        tools=[send_outreach, generate_story, log_failure],
        state_modifier=_OUTREACH_SYSTEM,
    )
