# ShiftSync AI — AI Builder Cup Submission Package

> **Event:** Google Cloud AI Builder Cup 2026 — JAPAC Region  
> **Theme:** Manufacturing: Intelligent Operations & Industrial Efficiency  
> **Grand Finale:** Dec 4, 2026 — Singapore  
> **Submission Deadline:** Oct 18, 2026  
> **Repository:** https://github.com/neeti26/AIBuilderCup  
> **Team:** ShiftSync (contact via GitHub issues)

---

## 1. Solution Summary

**ShiftSync AI** is an Intelligent Shift Handover Platform for manufacturing and aerospace operations. It eliminates communication gaps between shifts by using **Gemini 2.5 Flash** to auto-analyze operator logs, generate AI-powered handover reports, detect machine anomalies, and provide a natural-language operations assistant — all deployed on **Google Cloud Run + Firestore + Secret Manager** in `asia-southeast1` (Singapore).

**Problem:** Shift handover failures account for 15–20% of production downtime in aerospace manufacturing. Critical machine faults, safety incidents, and quality escapes are missed during shift transitions because information lives in handwritten logs and siloed reports.

**Solution:** A full-stack AI platform that turns unstructured operator logs into structured, actionable intelligence for incoming shift supervisors.

---

## 2. Submission Checklist (Mandatory)

| Requirement | Status | Location |
|-------------|--------|----------|
| Working deployed link (Cloud Run / Firebase) | ⬜ Deploy via `deploy.sh` | `shiftsync/deploy.sh` |
| Video demo (≤3 min, YouTube/Vimeo/Drive) | ⬜ Record after deploy | `VIDEO_DEMO.md` (script) |
| Public GitHub repository | ✅ | https://github.com/neeti26/AIBuilderCup |
| Pitch deck (PDF) | ⬜ Build from `PITCH_DECK.md` | `PITCH_DECK.md` |
| Theme declared | ✅ Manufacturing: Intelligent Operations & Industrial Efficiency | `README.md` |
| Google Cloud stack (Gemini + Cloud Run/Firestore) | ✅ | `backend/`, `deploy.sh` |

---

## 3. How to Deploy (Production, Singapore)

```bash
cd shiftsync
chmod +x deploy.sh
./deploy.sh <YOUR_GCP_PROJECT_ID> <YOUR_GEMINI_API_KEY>
```

This deploys backend + frontend to Cloud Run in `asia-southeast1` (Singapore), provisions Firestore, and stores secrets in Secret Manager. Outputs: App URL, API URL, API Docs.

Demo credentials: `supervisor` / `demo123`

---

## 4. Local Development

```bash
# Backend
cd shiftsync/backend
cp .env.example .env   # add GEMINI_API_KEY
python -m venv .venv
.venv\Scripts\activate   # Windows
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8080

# Frontend
cd shiftsync/frontend
cp .env.example .env.local
npm install && npm run dev
```

---

## 5. Judging Criteria Alignment

| Criteria (Weight) | How ShiftSync Addresses It |
|-------------------|---------------------------|
| **Technical Merit & Gen AI (40%)** | Gemini 2.5 Flash for log analysis, handover reports, chat, anomaly detection, maintenance recommendations; dual-model (Flash/Flash-Lite) for cost/quality; async REST via httpx; Firestore + Cloud Run serverless architecture |
| **Problem Alignment & Impact (25%)** | Directly targets manufacturing shift handover — 15–20% of aerospace downtime; aerospace-grade (AS9100, ISO 9001, OSHA, ISO 45001) context; safety-first alerting |
| **Innovation & Creativity (25%)** | AI-first (not just a digital logbook); natural-language ops interface; predictive maintenance before failures; automated LOTO safety violation detection |
| **User Experience & Design (10%)** | Industrial dark theme (factory-floor optimized); ARIA labels, keyboard navigation; mobile-responsive; single-click handover generation (45 min → 60 sec) |

---

## 6. Tech Stack

- **AI:** Gemini 2.5 Flash / Flash-Lite (Google AI Studio API)
- **Backend:** FastAPI (Python 3.14), async httpx REST client
- **Database:** Google Cloud Firestore (native mode, Singapore region)
- **Secrets:** Google Cloud Secret Manager
- **Hosting:** Google Cloud Run (backend + frontend)
- **Frontend:** React 18 + TypeScript, Tailwind CSS, TanStack Query, Recharts, Zustand
- **CI/CD:** Cloud Build (`cloudbuild.yaml`) + `deploy.sh`

---

## 7. Key Files

```
shiftsync/
├── deploy.sh              # One-command GCP deploy (Singapore)
├── cloudbuild.yaml        # CI/CD pipeline
├── firebase.json          # Firebase hosting + functions config
├── firestore.rules        # Firestore security rules
├── backend/               # FastAPI + Gemini service + Firestore
├── frontend/              # React + TypeScript SPA
├── test_gemini.py         # Direct Gemini API test
├── test_live.py           # Full E2E live test
├── README.md              # Full project documentation
├── PITCH_DECK.md          # Pitch deck content (→ PDF)
└── VIDEO_DEMO.md          # 3-minute video script
```

---

## 8. Demo Flow (for video & live demo)

1. **Login** as `supervisor` / `demo123`
2. **Seed demo data** — 10 aerospace machines across 3 lines
3. **Start a shift** — Day shift on Line-A (wing rib assembly)
4. **Submit operator logs** — e.g., CNC-A02 spindle overload fault + ROBOT-A01 LOTO safety near-miss
5. **Watch AI classify** — severity, category, root cause, action items, auto-alerts
6. **Generate handover report** — Gemini 2.5 Flash produces structured briefing with score
7. **Chat with AI Assistant** — "What are the top 3 things the next shift must action?"
8. **Dashboard** — OEE, machine status, open alerts in real time

---

## 9. Contact

Questions about this submission: open an issue at https://github.com/neeti26/AIBuilderCup/issues
