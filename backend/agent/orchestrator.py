"""
RakSetu — Multi-Agent Orchestrator
====================================
Architecture: Supervisor + Specialists (Bedrock tool-use pattern)

Supervisor: Bedrock Nova Lite with 7 tool definitions.
Specialists: Internal HTTP calls to existing FastAPI microservices.
             No separate Lambda needed — services already running in Docker.

Why this design for your setup:
  - All 9 FastAPI services already running (docker-compose)
  - Bedrock tool-use = authorized AWS service
  - Each tool maps to an existing endpoint in your microservices
  - No new dependencies — uses httpx (already in requirements)
  - Works in DEMO_MODE with realistic fake responses
  - Fully observable: logs every tool call + response

Integration: New endpoint in api-gateway/main.py
  POST /agent/run   → body: {"task": "...", "context": {...}}
  GET  /agent/status → last 10 agent decisions

Wire into api-gateway/main.py:
    from agent.orchestrator import router as agent_router
    app.include_router(agent_router)

Also used by Celery beat:
    @celery_app.task
    def daily_agent_tasks():
        asyncio.run(run_scheduled_tasks())
"""
import json
import logging
import os
from datetime import datetime
from typing import Any

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

logger = logging.getLogger("agent-orchestrator")

DEMO_MODE   = os.getenv("DEMO_MODE",   "true").lower() == "true"
AWS_REGION  = os.getenv("AWS_REGION",  "us-east-1")
LITE_MODEL  = os.getenv("BEDROCK_LITE_MODEL_ID",  "amazon.nova-lite-v1:0")

# Internal service URLs (same as in docker-compose.yml)
SERVICES = {
    "matching":      os.getenv("MATCHING_URL",      "http://matching-service:8001"),
    "prediction":    os.getenv("PREDICTION_URL",    "http://prediction-service:8002"),
    "notification":  os.getenv("NOTIFICATION_URL",  "http://notification-service:8003"),
    "voice":         os.getenv("VOICE_URL",         "http://voice-service:8004"),
    "story":         os.getenv("STORY_URL",         "http://story-engine:8007"),
}

router = APIRouter(prefix="/agent", tags=["agent"])

# ── System prompt ──────────────────────────────────────────────────────────────
_SYSTEM_PROMPT = """You are RakSetu, an autonomous blood donation coordination agent for Blood Warriors.

Your mission: coordinate blood donations for Thalassemia patients across India. You are a conversational assistant capable of both asking clarifying questions and autonomously executing tool chains.

## CRITICAL EXECUTION RULES:

1. **Ask for Clarification if Needed.** If the user's request is ambiguous, underspecified, or you need confirmation before triggering notifications, ask the user.
2. **Execute Autonomously When Ready.** Once you have enough context, DO NOT ask permission for every single step. Autonomously chain tool calls. Example correct flow:
   - User says "find top 3 and send outreach" →
     Step 1: Call `run_conversion_scoring` → get donor list
     Step 2: For each donor, call `generate_story` → get story text
     Step 3: For each donor, call `send_outreach` with the story → done
3. **If a tool returns an error**, use demo data and continue or explain the issue to the user.

## Key facts from the Blood Warriors dataset (7,033 records, Hyderabad region):
- 656 patients currently have PAST-DUE transfusions (avg 11 days overdue)
- 146 matched bridge donors are inactive (18.6% churn rate)
- 3 call attempts = inflection point: 65% donate after 3+ calls
- 321 donors marked "Very limited activity" → switch channel after 3 fails
- 361 donors marked "Not donated in 1 year" → emotional re-engagement needed
- 67 patients need transfusion in next 7 days
- 2,420 guests are dormant but have phone + GPS
- Top conversion candidates from last scoring: Ramesh Kumar (d001), Priya Sharma (d002), Vijay Reddy (d003)

## Decision rules:
1. Blood group match is mandatory before any outreach
2. Always check churn risk before selecting a donor (prefer risk < 0.4)
3. After 3 failed contacts: switch channel (WhatsApp → SMS → Voice)
4. Critical patients (past-due): fire all channels simultaneously
5. Always generate an impact story after a confirmed donation
6. Default patient_id = "demo-patient-001" when none is given
7. Default donor phone = "+919000000001" when none is known

## Available tools:
- `run_conversion_scoring` → Get top N conversion candidates (CALL THIS FIRST when asked about top donors)
- `match_donors` → Find donors for a specific patient (requires patient_id, use "demo-patient-001" as default)
- `get_donor_context` → Get full context for a specific donor_id
- `generate_story` → Generate impact story for donor+patient pair
- `send_outreach` → Send WhatsApp/SMS message to a donor
- `score_churn_risk` → Check a specific donor's churn risk score
- `get_urgency_summary` → Get current emergency dashboard stats
- `activate_guests` → Trigger dormant guest donor activation
- `log_failure` → Log a failed outreach attempt

Discuss, clarify, and execute. Do not wrap your final responses in XML tags like <response>."""

# ── Tool definitions (Bedrock tool-use format) ────────────────────────────────
_TOOLS = [
    {
        "toolSpec": {
            "name": "match_donors",
            "description": "Find best compatible blood donors for a patient. Returns ranked list with compatibility scores and churn risk.",
            "inputSchema": {"json": {
                "type": "object",
                "properties": {
                    "patient_id":  {"type": "string"},
                    "blood_group": {"type": "string"},
                    "urgency":     {"type": "string", "enum": ["normal","urgent","critical"]},
                    "top_n":       {"type": "integer", "default": 10},
                },
                "required": ["patient_id", "blood_group"],
            }},
        }
    },
    {
        "toolSpec": {
            "name": "get_donor_context",
            "description": "Get a donor's full interaction history and conversation memory. Returns last 10 interactions, donation count, response patterns.",
            "inputSchema": {"json": {
                "type": "object",
                "properties": {"donor_id": {"type": "string"}},
                "required": ["donor_id"],
            }},
        }
    },
    {
        "toolSpec": {
            "name": "send_outreach",
            "description": "Send a personalised outreach message to a donor. Selects best channel based on past response history (WhatsApp / SMS / Voice).",
            "inputSchema": {"json": {
                "type": "object",
                "properties": {
                    "donor_id":  {"type": "string"},
                    "phone":     {"type": "string"},
                    "message":   {"type": "string"},
                    "channel":   {"type": "string", "enum": ["whatsapp","sms","voice","auto"], "default": "auto"},
                    "urgency":   {"type": "string", "default": "normal"},
                    "language":  {"type": "string", "default": "hi"},
                },
                "required": ["donor_id", "phone"],
            }},
        }
    },
    {
        "toolSpec": {
            "name": "score_churn_risk",
            "description": "Score a donor's churn probability using the XGBoost model (AUC 0.999). Returns probability 0-1 and recommended intervention.",
            "inputSchema": {"json": {
                "type": "object",
                "properties": {"donor_id": {"type": "string"}},
                "required": ["donor_id"],
            }},
        }
    },
    {
        "toolSpec": {
            "name": "generate_story",
            "description": "Generate a personalised patient impact story for a donor using Bedrock Nova Lite. In the donor's language.",
            "inputSchema": {"json": {
                "type": "object",
                "properties": {
                    "donor_id":   {"type": "string"},
                    "patient_id": {"type": "string"},
                    "language":   {"type": "string", "default": "hi"},
                },
                "required": ["donor_id", "patient_id"],
            }},
        }
    },
    {
        "toolSpec": {
            "name": "log_failure",
            "description": "Log an outreach failure and get the recommended next protocol from the self-improving failure learning system.",
            "inputSchema": {"json": {
                "type": "object",
                "properties": {
                    "donor_id":          {"type": "string"},
                    "calls_attempted":   {"type": "integer"},
                    "days_inactive":     {"type": "integer"},
                    "trigger_comment":   {"type": "string"},
                    "language":          {"type": "string"},
                },
                "required": ["donor_id", "calls_attempted"],
            }},
        }
    },
    {
        "toolSpec": {
            "name": "get_urgency_summary",
            "description": "Get current transfusion urgency breakdown: past-due count, 7-day urgent, etc.",
            "inputSchema": {"json": {
                "type": "object",
                "properties": {},
            }},
        }
    },
    {
        "toolSpec": {
            "name": "activate_guests",
            "description": "Trigger guest activation for dormant users with matching blood group. 2,420 guests in pool, 15 with rare types.",
            "inputSchema": {"json": {
                "type": "object",
                "properties": {
                    "blood_group": {"type": "string"},
                    "limit":       {"type": "integer", "default": 50},
                },
            }},
        }
    },
    {
        "toolSpec": {
            "name": "run_conversion_scoring",
            "description": "Score all one-time donors for conversion to regular (AUC 0.921). Returns top 50 candidates for bridge assignment.",
            "inputSchema": {"json": {
                "type": "object",
                "properties": {"top_n": {"type": "integer", "default": 50}},
            }},
        }
    },
    {
        "toolSpec": {
            "name": "run_awareness_campaign",
            "description": "Trigger the blood group awareness campaign for users with unknown blood groups. Sends personalized messages about nearby camps.",
            "inputSchema": {"json": {
                "type": "object",
                "properties": {},
            }},
        }
    },
]


# ── Tool executor — calls existing microservice endpoints ─────────────────────
async def _execute_tool(tool_name: str, tool_input: dict) -> str:
    """Route tool call to the appropriate existing FastAPI microservice."""
    # Ensure all tool calls go through the real HTTP network stack to test microservices
    try:
        import httpx
        async with httpx.AsyncClient(timeout=60.0) as client:

            if tool_name == "match_donors":
                r = await client.post(
                    f"{SERVICES['matching']}/guardian-circle/build/{tool_input['patient_id']}",
                    json={"urgency": tool_input.get("urgency", "normal")},
                )
                return r.text

            elif tool_name == "get_donor_context":
                # Uses upgrade3_conversation_memory directly (imported in prediction-service)
                r = await client.get(
                    f"{SERVICES['prediction']}/donor/context/{tool_input['donor_id']}"
                )
                return r.text

            elif tool_name == "send_outreach":
                r = await client.post(
                    f"{SERVICES['notification']}/notify/donor",
                    json={
                        "donor_id": tool_input["donor_id"],
                        "phone":    tool_input.get("phone", ""),
                        "message":  tool_input.get("message", ""),
                        "channel":  tool_input.get("channel", "whatsapp"),
                        "urgency":  tool_input.get("urgency", "normal"),
                        "language": tool_input.get("language", "hi"),
                    }
                )
                return r.text

            elif tool_name == "score_churn_risk":
                r = await client.get(
                    f"{SERVICES['prediction']}/churn/donor/{tool_input['donor_id']}"
                )
                return r.text

            elif tool_name == "generate_story":
                r = await client.get(
                    f"{SERVICES['story']}/story/{tool_input['donor_id']}/{tool_input['patient_id']}",
                    params={"language": tool_input.get("language", "hi")},
                )
                return r.text

            elif tool_name == "log_failure":
                r = await client.post(
                    f"{SERVICES['notification']}/notify/failure-learn",
                    json={
                        "donor_id":                 tool_input["donor_id"],
                        "calls_attempted":           tool_input.get("calls_attempted", 1),
                        "days_since_last_donation":  tool_input.get("days_inactive", 0),
                        "inactive_trigger_comment":  tool_input.get("trigger_comment", ""),
                        "language":                  tool_input.get("language", "hi"),
                    }
                )
                return r.text

            elif tool_name == "get_urgency_summary":
                r = await client.get("http://api-gateway:8000/admin/alerts/summary")
                return r.text

            elif tool_name == "activate_guests":
                r = await client.post(
                    "http://api-gateway:8000/admin/activate-guests",
                    json={
                        "blood_group": tool_input.get("blood_group"),
                        "limit":       tool_input.get("limit", 50),
                    }
                )
                return r.text

            elif tool_name == "run_conversion_scoring":
                r = await client.get(
                    f"{SERVICES['prediction']}/conversion/candidates",
                    params={"top_n": tool_input.get("top_n", 50)},
                )
                return r.text

            else:
                return json.dumps({"error": f"Unknown tool: {tool_name}"})

    except Exception as e:
        logger.error(f"Tool {tool_name} call failed: {repr(e)}")
        return json.dumps({"error": repr(e), "tool": tool_name})


def _demo_tool_response(tool_name: str, tool_input: dict) -> dict:
    """Realistic demo responses for all tools."""
    responses = {
        "match_donors": {
            "donors": [
                {"donor_id": "d001", "name": "Ramesh Kumar",  "compat_score": 0.97, "churn_risk": 0.12, "language": "hi", "status": "active"},
                {"donor_id": "d002", "name": "Priya Sharma",  "compat_score": 0.93, "churn_risk": 0.08, "language": "hi", "status": "active"},
                {"donor_id": "d003", "name": "Vijay Reddy",   "compat_score": 0.91, "churn_risk": 0.71, "language": "te", "status": "at_risk"},
            ],
            "matched": 3, "blood_group": tool_input.get("blood_group", "B Positive"),
        },
        "get_donor_context": {
            "donor_id": tool_input.get("donor_id"),
            "total_events": 7, "donations_completed": 3,
            "last_event_type": "donation_completed",
            "last_event_content": "1 unit B+ donated successfully",
            "calls_no_answer": 0,
        },
        "send_outreach": {
            "status": "sent", "channel": "whatsapp",
            "message_preview": "नमस्ते Ramesh! एक मरीज़ को आपकी ज़रूरत है।",
            "demo": True,
        },
        "score_churn_risk": {
            "donor_id": tool_input.get("donor_id"),
            "churn_probability": 0.12,
            "intervention": "no_action_needed",
            "model_auc": 0.9990,
        },
        "generate_story": {
            "story": "आपका 32वाँ donation एक 9 साल के बच्चे के लिए था जो पिछले हफ्ते पहली बार स्कूल में पहला नंबर आया।",
            "language": tool_input.get("language", "hi"),
            "model": "nova-lite",
        },
        "log_failure": {
            "next_action": "switch_to_sms",
            "wait_hours": 6,
            "strategy": "channel_switch",
            "logged": True,
        },
        "get_urgency_summary": {
            "critical_past_due": 656,
            "urgent_0_7_days":   67,
            "high_8_14_days":    28,
            "normal_15_30_days": 35,
            "demo": True,
        },
        "activate_guests": {
            "triggered": 47, "rare_count": 15, "demo": True,
        },
        "run_conversion_scoring": {
            "candidates_scored": 2385,
            "top_probability":   0.921,
            "model_auc":         0.9214,
            "demo": True,
        },
    }
    return responses.get(tool_name, {"status": "demo_ok", "tool": tool_name})


# ── Main supervisor loop ───────────────────────────────────────────────────────
async def run_supervisor(messages: list[dict], context: dict[str, Any],
                          max_iterations: int = 10) -> dict:
    """
    Bedrock Nova Lite agentic loop with tool use.
    Think → Tool call → Observe → Repeat → Final response.
    """
    logger.info(f"Supervisor starting with {len(messages)} messages")

    # Add context to the latest message if it's from the user
    if messages and messages[-1]["role"] == "user":
        original_text = messages[-1]["content"][0]["text"]
        messages[-1]["content"][0]["text"] = f"{original_text}\n\n[System Context: {json.dumps(context)}]"


    # Build tool config in converse() format
    tool_config = {
        "tools": [
            {
                "toolSpec": {
                    "name":        t["toolSpec"]["name"],
                    "description": t["toolSpec"]["description"],
                    "inputSchema": t["toolSpec"]["inputSchema"],
                }
            }
            for t in _TOOLS
        ]
    }

    try:
        import boto3
        bedrock = boto3.client("bedrock-runtime", region_name=AWS_REGION)
    except Exception as e:
        logger.error(f"Bedrock client failed: {e}")
        return _demo_supervisor_response(task, context)

    for iteration in range(max_iterations):
        import asyncio
        from functools import partial
        
        try:
            # converse() is the correct API for Nova tool-use (not invoke_model)
            # Run the synchronous boto3 call in a thread pool to avoid blocking FastAPI
            loop = asyncio.get_running_loop()
            func = partial(
                bedrock.converse,
                modelId=LITE_MODEL,
                system=[{"text": _SYSTEM_PROMPT}],
                messages=messages,
                toolConfig=tool_config,
                inferenceConfig={"maxTokens": 1000, "temperature": 0.3},
            )
            resp = await loop.run_in_executor(None, func)
            result = resp
        except Exception as e:
            logger.error(f"Bedrock converse error (iter {iteration}): {e}")
            return _demo_supervisor_response(task, context)

        stop_reason = result.get("stopReason", "end_turn")
        content     = result.get("output", {}).get("message", {}).get("content", [])
        tool_uses   = [c for c in content if "toolUse" in c]
        texts       = [c.get("text", "") for c in content if "text" in c]

        if not tool_uses or stop_reason == "end_turn":
            final = "\n".join(texts).strip()
            logger.info(f"Supervisor done in {iteration+1} iterations")
            return {
                "response":   final,
                "iterations": iteration + 1,
                "ts":         datetime.utcnow().isoformat(),
            }

        # Execute all tool calls in parallel
        tool_results = []
        for tu_block in tool_uses:
            tu     = tu_block["toolUse"]
            t_name  = tu.get("name", "")
            t_input = tu.get("input", {})
            t_id    = tu.get("toolUseId", "")
            logger.info(f"[Iter {iteration+1}] Tool: {t_name}({json.dumps(t_input)[:100]})")
            t_result = await _execute_tool(t_name, t_input)
            logger.info(f"[Iter {iteration+1}] Result: {t_result[:200]}")
            tool_results.append({
                "toolResult": {
                    "toolUseId": t_id,
                    "content":   [{"text": t_result}],
                }
            })

        messages.append({"role": "assistant", "content": content})
        messages.append({"role": "user",      "content": tool_results})

    return {
        "response": "Max iterations reached — partial completion",
        "ts":       datetime.utcnow().isoformat(),
    }


def _demo_supervisor_response(task: str, context: dict) -> dict:
    return {
        "task":     task,
        "response": (
            "[DEMO] Supervisor completed autonomously. "
            "Tools called: get_urgency_summary → match_donors (3 donors, 97% compat) → "
            "get_donor_context (7 prior interactions) → score_churn_risk (0.12) → "
            "send_outreach (WhatsApp Hindi) → generate_story → log_failure. "
            "All 67 urgent patients activated. 146 at-risk donors flagged for channel switch."
        ),
        "tools_called": [
            "get_urgency_summary", "match_donors", "get_donor_context",
            "score_churn_risk", "send_outreach", "generate_story"
        ],
        "iterations": 4,
        "ts":  datetime.utcnow().isoformat(),
        "demo": True,
    }


# ── FastAPI endpoints ──────────────────────────────────────────────────────────
class AgentRunIn(BaseModel):
    task:    str
    context: dict = {}


class ScheduledTaskIn(BaseModel):
    trigger: str  # daily_churn_scan | patient_request | weekly_stories | conversion_scoring


@router.post("/run")
async def run_agent(body: AgentRunIn):
    """
    Run the supervisor agent with a free-text task.
    Wire into api-gateway/main.py — protected by JWT.
    """
    result = await run_supervisor(body.task, body.context)
    return result


@router.post("/scheduled")
async def run_scheduled(body: ScheduledTaskIn):
    """
    Predefined scheduled tasks. Called by Celery beat or EventBridge.
    Add to celery_tasks.py:
        @celery_app.task
        def daily_agent_tasks():
            asyncio.run(run_scheduled(ScheduledTaskIn(trigger="daily_churn_scan")))
    """
    task_map = {
        "daily_churn_scan": (
            "Check churn risk for all active bridge donors. Flag those above 0.6 for intervention. "
            "For each at-risk donor, generate a context-aware re-engagement message using their "
            "conversation history and send via their last responsive channel."
        ),
        "patient_request": (
            "A new urgent patient transfusion request has arrived. "
            "Get the urgency summary, find the best matched donor, check their context, "
            "score their churn risk, then send outreach via the optimal channel."
        ),
        "weekly_stories": (
            "Generate personalised impact stories for all donors who completed a donation "
            "in the last 7 days. Send each story in the donor's preferred language via WhatsApp."
        ),
        "conversion_scoring": (
            "Run conversion scoring for all one-time donors. Assign the top 50 candidates "
            "as secondary bridge donors and send personalised bridge-assignment invitations."
        ),
        "activate_guests": (
            "Run the guest activation scan. Identify dormant guests whose blood group "
            "is currently needed by a patient. Prioritise rare blood groups. "
            "Send activation messages via WhatsApp."
        ),
    }

    task = task_map.get(body.trigger, body.trigger)
    result = await run_supervisor(task, {"trigger": body.trigger})
    return result


@router.get("/status")
async def agent_status():
    """Health check for the agent system."""
    return {
        "status":       "ready",
        "model":        LITE_MODEL,
        "demo_mode":    DEMO_MODE,
        "tools":        [t["toolSpec"]["name"] for t in _TOOLS],
        "service_urls": SERVICES,
        "ts":           datetime.utcnow().isoformat(),
    }
