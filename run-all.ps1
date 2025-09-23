# === Configura tus rutas ===
$Backend = "C:\Users\Latitude\WebFB\backend"
$Frontend = "C:\Users\Latitude\WebFB\frontend"

# ngrok de WindowsApps (Store). Si no existe, pon tu ruta exacta al ngrok.exe
$Ngrok = "$env:LOCALAPPDATA\Microsoft\WindowsApps\ngrok.exe"

# 1) Backend (Uvicorn)
Start-Process powershell -ArgumentList @(
  "-NoExit",
  "-Command",
  "cd `"$Backend`"; .\.venv\Scripts\Activate.ps1; python -m uvicorn app:app --host 0.0.0.0 --port 8000 --reload"
)

# 2) Frontend (Vite con host y proxy)
Start-Process powershell -ArgumentList @(
  "-NoExit",
  "-Command",
  "cd `"$Frontend`"; npm run dev -- --host"
)

# 3) ngrok (túnel al front :5173)
Start-Process powershell -ArgumentList @(
  "-NoExit",
  "-Command",
  "& `"$Ngrok`" http 5173"
)
