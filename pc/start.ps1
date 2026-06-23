# NavAssist - Phase 1 PC startup script
# Run from the /pc directory: .\start.ps1

Write-Host "`nNavAssist PC Server - Phase 1 Network Bridge" -ForegroundColor Cyan

# Print the expected hotspot IP
Write-Host "Expected hotspot IP: 192.168.137.1" -ForegroundColor Yellow
Write-Host "Confirm in:  Settings > Network & Internet > Mobile Hotspot`n" -ForegroundColor Yellow

# Create and activate venv if it doesn't exist
if (-not (Test-Path "venv")) {
    Write-Host "Creating virtual environment..." -ForegroundColor Green
    python -m venv venv
}

Write-Host "Activating virtual environment..." -ForegroundColor Green
. venv\Scripts\Activate.ps1

# Install dependencies
Write-Host "Installing dependencies..." -ForegroundColor Green
pip install -r requirements.txt --quiet

Write-Host "`nStarting FastAPI server on 0.0.0.0:8000 ..." -ForegroundColor Green
Write-Host "Waiting for phone to connect. Press Ctrl+C to stop.`n" -ForegroundColor Green

python server.py
