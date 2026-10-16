@echo off
:: ─── ShiftSync AI — Local Development Runner (Windows) ──────────────────────
:: Runs backend + frontend locally for testing before cloud deployment.
:: Usage: run_local.bat
::
:: Prerequisites:
::   - Python 3.11+
::   - Node.js 20+
::   - GEMINI_API_KEY set in backend\.env
:: ─────────────────────────────────────────────────────────────────────────────

setlocal enabledelayedexpansion

set ROOT_DIR=%~dp0shiftsync
set BACKEND_DIR=%ROOT_DIR%\backend
set FRONTEND_DIR=%ROOT_DIR%\frontend

echo ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo   ShiftSync AI — Local Development
echo   Backend  : http://localhost:8080
echo   Frontend : http://localhost:5173
echo   API Docs : http://localhost:8080/docs
echo ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

:: Check .env exists
if not exist "%BACKEND_DIR%\.env" (
  echo.
  echo WARNING: Creating backend\.env from .env.example...
  copy "%BACKEND_DIR%\.env.example" "%BACKEND_DIR%\.env" >nul
  echo   Please edit %BACKEND_DIR%\.env and add your GEMINI_API_KEY
  echo   Then re-run this script.
  pause
  exit /b 1
)

:: ── Backend ──
echo.
echo Starting backend (FastAPI + Gemini 2.5 Flash)...
cd /d "%BACKEND_DIR%"

if not exist ".venv" (
  echo   Creating virtual environment...
  python -m venv .venv
)

call .venv\Scripts\activate.bat
pip install -q -r requirements.txt

:: Start backend in background
start "ShiftSync Backend" cmd /c "uvicorn app.main:app --host 127.0.0.1 --port 8080 --reload"
echo   Backend started.

:: Wait for backend to be ready
echo   Waiting for backend to be ready...
for /L %%i in (1,1,30) do (
  curl -s http://127.0.0.1:8080/health >nul 2>&1 && goto backend_ready
  timeout /t 1 >nul
)
:backend_ready
echo   Backend is ready!

:: ── Frontend ──
echo.
echo Starting frontend (React + Vite)...
cd /d "%FRONTEND_DIR%"

if not exist "node_modules" (
  echo   Installing npm dependencies...
  npm install
)

start "ShiftSync Frontend" cmd /c "npm run dev"
echo   Frontend started.

echo.
echo ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo   ShiftSync AI is running locally!
echo.
echo   Frontend : http://localhost:5173
echo   Backend  : http://localhost:8080
echo   API Docs : http://localhost:8080/docs
echo.
echo   Demo login : supervisor / demo123
echo.
echo   Close the terminal windows to stop both services.
echo ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

pause
