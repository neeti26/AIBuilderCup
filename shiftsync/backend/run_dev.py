"""
Dev launcher — loads .env into os.environ BEFORE importing app code,
so pydantic-settings picks up the real values on Windows.
"""
import os, pathlib

def load_env():
    env_file = pathlib.Path(__file__).parent / ".env"
    if env_file.exists():
        for line in env_file.read_text().splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, _, val = line.partition("=")
                os.environ.setdefault(key.strip(), val.strip())

if __name__ == "__main__":
    load_env()
    key = os.environ.get("GEMINI_API_KEY", "NOT SET")
    print(f"[run_dev] GEMINI_API_KEY prefix: {key[:12]}...")
    print(f"[run_dev] PROJECT: {os.environ.get('GOOGLE_CLOUD_PROJECT')}")

    import uvicorn
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8080,
        reload=True,
        reload_dirs=["app"],
    )
else:
    # Called by uvicorn reloader subprocess — re-load env
    load_env()
