import asyncio
import os
import json

# Set up environment variables locally
os.environ["DEMO_MODE"] = "false"
from dotenv import load_dotenv
load_dotenv("c:\\Users\\Nikhil Singhvi\\OneDrive\\Desktop\\raksetu\\backend\\.env")

from backend.agent.orchestrator import run_supervisor
import backend.agent.orchestrator as orch

# Override the service URLs to point to EC2 backend
orch.SERVICES["matching"] = "http://3.91.21.161:8001"
orch.SERVICES["prediction"] = "http://3.91.21.161:8002"
orch.SERVICES["notification"] = "http://3.91.21.161:8003"
orch.SERVICES["voice"] = "http://3.91.21.161:8004"
orch.SERVICES["story"] = "http://3.91.21.161:8007"

async def test_agent():
    messages = [
        {
            "role": "user",
            "content": [{"text": "Generate a story for donor d001 and patient p001 in Hindi. Show me the exact text you get back."}],
        }
    ]
    
    print("Running supervisor...")
    result = await run_supervisor(messages, {})
    print("\n--- FINAL RESULT ---")
    print(json.dumps(result, indent=2))

if __name__ == "__main__":
    # Add backend directory to path
    import sys
    sys.path.append("c:\\Users\\Nikhil Singhvi\\OneDrive\\Desktop\\raksetu")
    
    import logging
    logging.basicConfig(level=logging.INFO)
    
    asyncio.run(test_agent())
