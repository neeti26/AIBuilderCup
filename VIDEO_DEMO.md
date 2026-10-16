# ShiftSync AI — 3-Minute Video Demo Script

> **Target length:** 180 seconds (3 minutes)  
> **Format:** Screen recording + voiceover  
> **Upload to:** YouTube / Vimeo / Google Drive (public link)  
> **Include link in:** README.md, SUBMISSION.md, and hackathon submission form

---

## Video Structure (by seconds)

| Time | Scene | Visual | Voiceover |
|------|-------|--------|-----------|
| 0:00–0:15 | **Title card** | ShiftSync AI logo, theme tag, event name | "ShiftSync AI — an intelligent shift handover platform for manufacturing, built for the Google Cloud AI Builder Cup." |
| 0:15–0:35 | **The problem** | Text overlay: "15–20% of aerospace downtime = shift handover failures" + images of paper logs | "Critical machine faults, safety incidents, and quality issues get lost between shifts. Information lives in handwritten logs and siloed reports." |
| 0:35–0:50 | **Login** | Login page, enter `supervisor` / `demo123`, dashboard loads | "ShiftSync fixes this with AI. Log in as a supervisor and you're on the operations dashboard." |
| 0:50–1:10 | **Start shift + seed machines** | Click "Start Shift" → Day shift Line-A → machines appear with OEE/status | "Start a shift on your production line. Machines load with real-time OEE, status, and telemetry." |
| 1:10–1:40 | **Submit logs + AI analysis** | Type two logs: (1) CNC-A02 spindle overload fault, (2) ROBOT-A01 LOTO safety near-miss → watch Gemini classify severity/category/root cause/action items | "Submit an operator log. Gemini 2.5 Flash instantly classifies severity, category, root cause, and extracts action items. A safety-critical LOTO violation triggers an immediate alert." |
| 1:40–2:10 | **Generate handover report** | Click "Generate Handover Report" → Gemini produces executive summary, performance score, critical issues, action items, next-shift recommendations | "At shift end, one click generates a complete AI handover report — executive summary, performance score, prioritized action items, and next-shift recommendations. What took 45 minutes now takes 60 seconds." |
| 2:10–2:35 | **AI chat assistant** | Open Assistant page → ask "What are the top 3 things the next shift supervisor must action?" → get specific answer referencing CNC-A02 and ROBOT-A01 | "Need more detail? Ask the AI assistant in plain language. It has full shift context — machines, logs, alerts — and gives specific, actionable answers." |
| 2:35–2:50 | **Dashboard + deploy context** | Dashboard shows OEE, machine status, open alerts → show Cloud Run / Firestore / Singapore region badge | "Real-time dashboard. Built on Google Cloud — Cloud Run, Firestore, Secret Manager — deployed in Singapore (asia-southeast1)." |
| 2:50–3:00 | **Closing** | Title card: "ShiftSync AI — Zero-gap shift transitions. Powered by Gemini 2.5 Flash + Google Cloud." + GitHub URL | "ShiftSync. Zero-gap shift transitions. Powered by AI. See it live at github.com/neeti26/AIBuilderCup." |

---

## Recording Tips

1. **Use the deployed app** (after `./deploy.sh`) — not localhost — so judges see it running on Google Cloud.
2. **Voiceover:** Speak clearly, ~130–150 words per minute. Total script ≈ 350–400 words.
3. **Highlight the AI moments:** Zoom/cursor on the Gemini classification results and handover report generation — these are the Gen AI core judges look for.
4. **Show the Singapore region:** Mention `asia-southeast1` deployment to tie into the finale location.
5. **Demo credentials visible:** `supervisor` / `demo123` so reviewers can replicate.
6. **Export:** 1080p, MP4, under 100MB if possible. Upload to YouTube/Vimeo as unlisted/public, or Google Drive with public link.

---

## What to Show on Screen (in order)

1. LoginPage (`/login`)
2. Dashboard (`/`) — KPI cards, OEE chart, active shift
3. ShiftPage (`/shift`) — start shift, submit 2 logs, watch AI analysis badges appear
4. AlertsPage (`/alerts`) — critical auto-alert visible
5. HandoverPage (`/handover`) — generate report, scroll through sections
6. AIAssistantPage (`/assistant`) — ask the top-3-priorities question
7. MachinesPage (`/machines`) — OEE bars, fault machine highlighted

---

## Links to Fill In After Deploy

- **Deployed app URL:** `https://shiftsync-frontend-<hash>.run.app` (from `deploy.sh` output)
- **API docs:** `https://shiftsync-backend-<hash>.run.app/docs`
- **Video demo (YouTube/Vimeo/Drive):** `<PASTE PUBLIC LINK>`
- **GitHub repo:** https://github.com/neeti26/AIBuilderCup
