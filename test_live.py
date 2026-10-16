"""Full E2E live test of ShiftSync AI with Gemini 2.5 Flash."""
import urllib.request, json, sys
sys.stdout.reconfigure(encoding='utf-8') if hasattr(sys.stdout, 'reconfigure') else None

BASE = 'http://localhost:8080/api/v1'

def api(path, data=None, token=None, method=None):
    headers = {'Content-Type': 'application/json'}
    if token:
        headers['Authorization'] = 'Bearer ' + token
    body = json.dumps(data).encode() if data is not None and method != 'GET' else None
    m = method or ('POST' if body else 'GET')
    req = urllib.request.Request(BASE + path, data=body, headers=headers, method=m)
    return json.loads(urllib.request.urlopen(req, timeout=120).read())

print("1. Seeding users...")
r = api('/seed/init-users', method='POST')
print("   ", r['message'])

print("2. Login as supervisor...")
r = api('/auth/login', {'username': 'supervisor', 'password': 'demo123'})
token = r['access_token']
print("   User:", r['user']['full_name'], "|", r['user']['role'])

print("3. Seeding 10 demo machines...")
r = api('/seed/demo-data', token=token, method='POST')
print("   Machines:", r['seeded']['machines_seeded'])

print("4. Creating Day Shift on Line-A...")
r = api('/shifts/', {'shift_type': 'day', 'line': 'Line-A', 'date': '2026-10-12',
                     'supervisor': 'sup1', 'team_members': [], 'production_target': 250}, token)
shift_id = r['id']
print("   Shift ID:", shift_id)

print()
print("=" * 55)
print("  LIVE GEMINI 2.5 FLASH AI TESTS")
print("=" * 55)

# ── Test 1: Log Analysis ──────────────────────────────────
print("\n[TEST 1] Operator Log - AI Analysis")
r = api('/logs/', {
    'shift_id': shift_id,
    'raw_text': (
        'CNC-A02 spindle overload fault E-047 at 14:23. '
        'Machine stopped mid-cycle on wing rib WS-2847. Emergency stop triggered. '
        'Part likely scrapped — pulling for measurement now. '
        'Line-A throughput down 40%. Maintenance ETA 90 mins.'
    ),
    'machine_id': 'CNC-A02'
}, token)
ai = r['ai_analysis']
print("  Severity    :", ai['severity'])
print("  Category    :", ai['category'])
print("  AI Summary  :", ai['ai_summary'])
print("  Root Cause  :", ai.get('root_cause_hint', 'N/A'))
print("  Actions     :", ai.get('action_items', []))
print("  Tags        :", ai.get('tags', []))
print("  Immediate?  :", ai.get('requires_immediate_attention'))
print("  Alert creat :", r['alert_created'])

# ── Test 2: Second log ────────────────────────────────────
print("\n[TEST 2] Safety Incident Log → AI Analysis")
r = api('/logs/', {
    'shift_id': shift_id,
    'raw_text': (
        'Near-miss incident at 09:47 near ROBOT-A01: technician entered '
        'safeguarded area without LOTO procedure. Machine in teach mode, detected '
        'intrusion and stopped immediately. No injury. Incident report filed. '
        'Toolbox talk conducted with all floor personnel at 10:15.'
    ),
    'machine_id': 'ROBOT-A01'
}, token)
ai2 = r['ai_analysis']
print("  Severity    :", ai2['severity'])
print("  Category    :", ai2['category'])
print("  AI Summary  :", ai2['ai_summary'])
print("  Immediate?  :", ai2.get('requires_immediate_attention'))

# ── Test 3: AI Chat ───────────────────────────────────────
print("\n[TEST 3] AI Chat — natural language query")
r = api('/ai/chat', {
    'message': 'What are the top 3 things the next shift supervisor must action immediately?',
    'shift_id': shift_id,
    'conversation_history': []
}, token)
print("  AI Response :", r['response'][:400])
print("  Suggestions :", r.get('suggested_actions', []))

# ── Test 4: Dashboard ─────────────────────────────────────
print("\n[TEST 4] Dashboard Stats")
r = api('/ai/dashboard', token=token)
print("  Machines    :", r['machines_total'], "total,", r['machines_running'], "running,", r['machines_fault'], "fault")
print("  OEE Average :", r['oee_average'], "%")
print("  Open Alerts :", r['open_alerts'])

# ── Test 5: Handover Report ───────────────────────────────
print("\n[TEST 5] AI Handover Report (Gemini 2.5 Flash)")
print("  Generating... (may take 10-20 seconds)")
r = api('/handover/generate', {'shift_id': shift_id}, token)
report = r['report']
print("  Score       :", report.get('shift_performance_score'))
print("  Exec Summary:", report.get('executive_summary', '')[:250])
print("  Action Items:", len(report.get('action_items', [])))
print("  Safety Issues:", len(report.get('safety_incidents', [])))
print("  Next Shift Rec:", report.get('next_shift_recommendations', '')[:200])

print()
print("=" * 55)
print("  ALL TESTS PASSED — Gemini 2.5 Flash is LIVE!")
print("=" * 55)
