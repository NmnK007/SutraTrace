@echo off
cd /d "%~dp0"
if not exist ".venv\Scripts\python.exe" (
  echo Python environment missing. Follow README.md setup instructions.
  pause
  exit /b 1
)
if not exist "frontend\dist\index.html" (
  echo Frontend build missing. Run npm --prefix frontend ci and npm --prefix frontend run build.
  pause
  exit /b 1
)
echo SutraTrace: http://127.0.0.1:8765
echo Keep this window open. Press Ctrl+C to stop.
".venv\Scripts\python.exe" -m uvicorn backend.app:app --host 127.0.0.1 --port 8765
pause
