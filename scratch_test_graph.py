import asyncio
import os
import sys

# setup path
sys.path.insert(0, os.path.abspath('backend'))
sys.path.insert(0, os.path.abspath('backend/lambdas'))

# set env vars
os.environ["DEMO_MODE"] = "false"
os.environ["AWS_REGION"] = "us-east-1"
os.environ["LANGCHAIN_TRACING_V2"] = "false" # avoid langsmith errors for this test

from agent.orchestrator import invoke_graph

prompt = "Check the matching service for urgent or critical patients. If any are found, check our dormant guest pool and run an awareness campaign for them."

async def run():
    print(f"User: {prompt}")
    async for event in graph.astream({"messages": [("user", prompt)]}, config={"recursion_limit": 10}):
        for k, v in event.items():
            print(f"--- {k} ---")
            if "messages" in v and v["messages"]:
                print(v["messages"][-1].content)
            elif "tool_results" in v and v["tool_results"]:
                print("Tool Results:", [r.get("agent") for r in v["tool_results"]])
    
    state = graph.get_state({"configurable": {"thread_id": "1"}}).values
    # Note: State might not be stored if using MemorySaver without thread_id in config
    pass

if __name__ == "__main__":
    asyncio.run(run())
