import json
import logging
import httpx
from langchain_core.tools import tool
from .orchestrator import SERVICES, DEMO_MODE, _demo_tool_response

logger = logging.getLogger("agent-tools")

async def _call_service(tool_name: str, url: str, method: str = "GET", **kwargs) -> str:
    """Helper to call services or return demo data."""
    if DEMO_MODE:
        return json.dumps(_demo_tool_response(tool_name, kwargs.get("json", kwargs.get("params", {}))))
    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            if method == "POST":
                r = await client.post(url, **kwargs)
            else:
                r = await client.get(url, **kwargs)
            return r.text
    except Exception as e:
        logger.error(f"Tool {tool_name} call failed: {repr(e)}")
        return json.dumps({"error": repr(e), "tool": tool_name})

@tool
async def match_donors(patient_id: str, blood_group: str, urgency: str = "normal", top_n: int = 10) -> str:
    """Find best compatible blood donors for a patient. Returns ranked list with compatibility scores and churn risk."""
    url = f"{SERVICES['matching']}/guardian-circle/build/{patient_id}"
    return await _call_service("match_donors", url, method="POST", json={"urgency": urgency})

@tool
async def search_donor_by_name(name: str) -> str:
    """Search the database for a donor by their name to retrieve their donor_id and phone number."""
    # Since this directly queries DB in orchestrator, we can implement it here or keep the _execute_tool logic.
    # To keep it simple, we'll replicate the logic here.
    from shared.db import db_session
    from sqlalchemy import select
    from shared.models import Donor, Person
    try:
        async with db_session() as session:
            result = await session.execute(
                select(Donor, Person)
                .join(Person, Donor.person_id == Person.id)
                .where(Person.name.ilike(f"%{name}%"))
                .limit(5)
            )
            donors = [{"donor_id": str(d.id), "name": p.name, "phone": p.phone, "blood_group": p.blood_group} for d, p in result.all()]
            if not donors: return json.dumps({"error": f"No donors found with name matching '{name}'"})
            return json.dumps(donors)
    except Exception as e:
        return json.dumps({"error": repr(e)})

@tool
async def create_patient_record(name: str, phone: str, thalassemia_type: str, city: str = "", age: int = 0, weight_kg: float = 0.0) -> str:
    """Create a new patient entry in the database. Returns the new patient_id."""
    from shared.db import db_session
    from shared.models import Person, Patient
    try:
        async with db_session() as session:
            new_person = Person(role="patient", name=name, phone=phone, city=city)
            session.add(new_person)
            await session.flush()
            new_patient = Patient(person_id=new_person.id, age=age, weight_kg=weight_kg, thalassemia_type=thalassemia_type)
            session.add(new_patient)
            await session.commit()
            return json.dumps({"status": "success", "patient_id": str(new_patient.id), "message": f"Created patient {name}"})
    except Exception as e:
        return json.dumps({"error": repr(e)})

@tool
async def get_urgency_summary() -> str:
    """Get current transfusion urgency breakdown: past-due count, 7-day urgent, etc."""
    return await _call_service("get_urgency_summary", "http://api-gateway:8000/admin/alerts/summary")

@tool
async def score_churn_risk(donor_id: str) -> str:
    """Score a donor's churn probability using the XGBoost model. Returns probability 0-1 and recommended intervention."""
    url = f"{SERVICES['prediction']}/churn/donor/{donor_id}"
    return await _call_service("score_churn_risk", url)

@tool
async def run_conversion_scoring(top_n: int = 50) -> str:
    """Score all one-time donors for conversion to regular. Returns top candidates for bridge assignment."""
    url = f"{SERVICES['prediction']}/conversion/candidates"
    return await _call_service("run_conversion_scoring", url, params={"top_n": top_n})

@tool
async def get_donor_context(donor_id: str) -> str:
    """Get a donor's full interaction history and conversation memory. Returns last 10 interactions."""
    url = f"{SERVICES['prediction']}/donor/context/{donor_id}"
    return await _call_service("get_donor_context", url)

@tool
async def generate_story(donor_id: str, patient_id: str, language: str = "hi") -> str:
    """Generate a personalised patient impact story for a donor using Bedrock Nova Lite."""
    url = f"{SERVICES['story']}/story/{donor_id}/{patient_id}"
    return await _call_service("generate_story", url, params={"language": language})

@tool
async def send_outreach(phone: str, message: str, donor_id: str = "", channel: str = "auto", urgency: str = "normal", language: str = "hi") -> str:
    """Send a personalised outreach message to a donor. Selects best channel based on past response history."""
    url = f"{SERVICES['notification']}/notify/donor"
    return await _call_service("send_outreach", url, method="POST", json={"donor_id": donor_id, "phone": phone, "message": message, "channel": channel, "urgency": urgency, "language": language})

@tool
async def log_failure(donor_id: str, calls_attempted: int, days_inactive: int = 0, trigger_comment: str = "", language: str = "hi") -> str:
    """Log an outreach failure and get the recommended next protocol from the self-improving failure learning system."""
    url = f"{SERVICES['notification']}/notify/failure-learn"
    return await _call_service("log_failure", url, method="POST", json={"donor_id": donor_id, "calls_attempted": calls_attempted, "days_since_last_donation": days_inactive, "inactive_trigger_comment": trigger_comment, "language": language})

@tool
async def activate_guests(blood_group: str = "", limit: int = 50) -> str:
    """Trigger guest activation for dormant users with matching blood group."""
    return await _call_service("activate_guests", "http://api-gateway:8000/admin/activate-guests", method="POST", json={"blood_group": blood_group, "limit": limit})

@tool
async def run_awareness_campaign() -> str:
    """Trigger the blood group awareness campaign for users with unknown blood groups."""
    return await _call_service("run_awareness_campaign", "http://api-gateway:8000/notify/awareness/run", method="POST")

MATCHING_TOOLS = [match_donors, search_donor_by_name, create_patient_record, get_urgency_summary]
PREDICTION_TOOLS = [score_churn_risk, run_conversion_scoring, get_donor_context]
OUTREACH_TOOLS = [generate_story, send_outreach, log_failure, activate_guests, run_awareness_campaign]
