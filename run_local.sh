#!/bin/bash
# ─── ShiftSync AI — Local Development Runner ──────────────────────────────────
# Runs backend + frontend locally for testing before cloud deployment.
# Usage: bash run_local.sh
#
# Prerequisites:
#   - Python 3.11+ with venv
#   - Node.js 20+
#   - GEMINI_API_KEY set in backend/.env
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/shiftsync" && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
FRONTEND_DIR="$ROOT_DIR/frontend"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  ShiftSync AI — Local Development"
echo "  Backend : http://localhost:8080"
echo "  Frontend: http://localhost:5173"
echo "  API Docs: http://localhost:8080/docs"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# ── Check .env exists ──
if [ ! -f "$BACKEND_DIR/.env" ]; then
  echo "⚠️  Creating backend/.env from .env.example..."
  cp "$BACKEND_DIR/.env.example" "$BACKEND_DIR/.env"
  echo "   Please edit $BACKEND_DIR/.env and add your GEMINI_API_KEY"
  echo "   Then re-run this script."
  exit 1
fi

# ── Backend ──
echo ""
echo "🐍 Starting backend (FastAPI + Gemini 2.5 Flash)..."
cd "$BACKEND_DIR"

if [ ! -d ".venv" ]; then
  echo "   Creating virtual environment..."
  python3 -m venv .venv
fi

source .venv/bin/activate
pip install -q -r requirements.txt

# Start backend in background
uvicorn app.main:app --host 127.0.0.1 --port 8080 --reload &
BACKEND_PID=$!
echo "   Backend PID: $BACKEND_PID"

# Wait for backend to be ready
echo "   Waiting for backend to be ready..."
for i in $(seq 1 30); do
  if curl -s http://127.0.0.1:8080/health > /dev/null 2>&1; then
    echo "   ✅ Backend is ready!"
    break
  fi
  sleep 1
done

# ── Frontend ──
echo ""
echo "🟢 Starting frontend (React + Vite)..."
cd "$FRONTEND_DIR"

if [ ! -d "node_modules" ]; then
  echo "   Installing npm dependencies..."
  npm install
fi

npm run dev &
FRONTEND_PID=$!
echo "   Frontend PID: $FRONTEND_PID"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  🎉 ShiftSync AI is running locally!"
echo ""
echo "  🌐 Frontend : http://localhost:5173"
echo "  🔌 Backend  : http://localhost:8080"
echo "  📖 API Docs : http://localhost:8080/docs"
echo ""
echo "  Demo login  : supervisor / demo123"
echo ""
echo "  Press Ctrl+C to stop both services."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# ── Cleanup on exit ──
cleanup() {
  echo ""
  echo "🛑 Shutting down..."
  kill $BACKEND_PID 2>/dev/null || true
  kill $FRONTEND_PID 2>/dev/null || true
  echo "   Done."
  exit 0
}
trap cleanup INT TERM

# Wait for both processes
wait
