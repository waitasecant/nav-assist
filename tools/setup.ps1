# Tools setup script - creates venv and installs dependencies
# Run from the tools/ directory: .\setup.ps1

if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
    Write-Host "ERROR: Python not found. Install Python 3.10+ from https://python.org/downloads/" -ForegroundColor Red
    exit 1
}

if (-not (Test-Path "venv")) {
    Write-Host "Creating virtual environment..." -ForegroundColor Green
    python -m venv venv
}

Write-Host "Activating virtual environment..." -ForegroundColor Green
. venv\Scripts\Activate.ps1

Write-Host "Installing dependencies..." -ForegroundColor Green
pip install -r requirements.txt

Write-Host "Running export..." -ForegroundColor Green
python export.py
if ($LASTEXITCODE -ne 0) {
    Write-Host "Export failed. Check output above." -ForegroundColor Red
    exit 1
}

Remove-Item "yolov8n.pt" -ErrorAction SilentlyContinue
Write-Host "Done." -ForegroundColor Green
Write-Host ""
Write-Host "To run tools in future terminals, activate the venv first:" -ForegroundColor Yellow
Write-Host "  cd tools" -ForegroundColor Yellow
Write-Host "  . .\venv\Scripts\Activate.ps1" -ForegroundColor Yellow