$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$projectPython = Join-Path $PSScriptRoot '.venv/Scripts/python.exe'
if (-not (Test-Path -LiteralPath $projectPython)) { throw 'Follow README.md setup instructions to create the Python environment.' }
if (-not (Test-Path -LiteralPath (Join-Path $PSScriptRoot 'frontend/dist/index.html'))) { throw 'Run npm --prefix frontend ci and npm --prefix frontend run build first.' }
Write-Host 'SutraTrace: http://127.0.0.1:8765'
Write-Host 'Keep this terminal open. Press Ctrl+C to stop.'
& $projectPython -m uvicorn backend.app:app --host 127.0.0.1 --port 8765
exit $LASTEXITCODE
