# Start the API (no auto-reload, so a running investigation is never interrupted) and the web app.
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Start-Process -FilePath "$root\.venv\Scripts\uvicorn.exe" -ArgumentList "--app-dir","backend","app.main:app","--port","8100" -WorkingDirectory $root
Start-Process -FilePath "pnpm" -ArgumentList "dev" -WorkingDirectory "$root\frontend"
Write-Host "API http://127.0.0.1:8100  ·  App http://localhost:3100"
