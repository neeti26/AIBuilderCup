import os, sys, asyncio
sys.path.insert(0, r'c:\Users\neeti\OneDrive\Desktop\AIBuilderCup\shiftsync\backend')

async def main():
    from app.config import settings
    print(f"GEMINI_API_KEY prefix: {(settings.GEMINI_API_KEY or '')[:15]}")
    print(f"GOOGLE_CLOUD_PROJECT : {settings.GOOGLE_CLOUD_PROJECT}")

    from app.services.gemini_service import analyze_log_entry, chat_with_shift_context

    # Test 1: Log analysis
    print("\n=== TEST 1: Log Analysis ===")
    result = await analyze_log_entry(
        raw_text=(
            "CNC-A02 spindle overload fault E-047 at 14:23. "
            "Machine stopped mid-cycle on wing rib part WS-2847. "
            "Emergency stop triggered. Part scrapped. "
            "Line-A throughput down 40%. Maintenance ETA 90 min."
        ),
        machine_id="CNC-A02",
    )
    print("Severity   :", result.get("severity"))
    print("Category   :", result.get("category"))
    print("AI Summary :", result.get("ai_summary"))
    print("Root cause :", result.get("root_cause_hint"))
    print("Actions    :", result.get("action_items", []))
    print("Tags       :", result.get("tags", []))
    print("Immediate? :", result.get("requires_immediate_attention"))

    # Test 2: Chat
    print("\n=== TEST 2: AI Chat ===")
    chat_result = await chat_with_shift_context(
        message="What are the most critical issues I should handle first in this shift?",
        shift_context={
            "shift_type": "day",
            "line": "Line-A",
            "logs": [{"severity": "critical", "raw_text": "CNC-A02 fault, machine stopped", "category": "machine"}],
            "machines": [{"name": "CNC-A02", "machine_id": "CNC-A02", "status": "fault", "oee": 0}],
        },
    )
    print("Response:", chat_result.get("response", "")[:300])
    print("Actions :", chat_result.get("suggested_actions", []))

asyncio.run(main())
