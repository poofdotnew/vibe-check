#!/usr/bin/env python3
import sys
import json
import asyncio
from claude_agent_sdk import query, ClaudeAgentOptions, ResultMessage


async def run_agent():
    request = json.loads(sys.stdin.read())
    prompt = request["prompt"]
    cwd = request["context"]["workingDirectory"]

    output = ""
    success = False

    try:
        options = ClaudeAgentOptions(
            cwd=cwd,
            allowed_tools=["Read", "Write", "Edit", "Glob", "Grep", "Bash"],
        )

        async for msg in query(prompt=prompt, options=options):
            if isinstance(msg, ResultMessage):
                output = msg.result or ""
                success = msg.subtype == "success"

        result = {"output": output, "success": success}
    except Exception as e:
        result = {"output": "", "success": False, "error": str(e)}

    print(json.dumps(result))


if __name__ == "__main__":
    asyncio.run(run_agent())
