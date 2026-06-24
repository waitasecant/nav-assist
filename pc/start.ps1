# PC startup script
# Run from the /pc directory: .\start.ps1

Write-Host "`nPC Server" -ForegroundColor Cyan
Write-Host "Expected hotspot IP: 192.168.137.1" -ForegroundColor Yellow
Write-Host "Confirm in: Settings > Network & Internet > Mobile Hotspot`n" -ForegroundColor Yellow

# Create and activate venv if it doesn't exist
if (-not (Test-Path "venv")) {
    Write-Host "Creating virtual environment..." -ForegroundColor Green
    python -m venv venv
}

Write-Host "Activating virtual environment..." -ForegroundColor Green
. venv\Scripts\Activate.ps1

# One-time model export if yolov8n.onnx is missing
if (-not (Test-Path "model\yolov8n.onnx")) {
    Write-Host "yolov8n.onnx not found - running first-time setup..." -ForegroundColor Yellow
    Write-Host "Installing export dependencies (ultralytics + torch, ~600 MB)..." -ForegroundColor Green
    pip install -r requirements-export.txt --quiet
    Write-Host "Exporting YOLOv8-nano to ONNX..." -ForegroundColor Green
    python export_model.py
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Export failed. Check output above." -ForegroundColor Red
        exit 1
    }
}

# Install runtime dependencies
Write-Host "Installing runtime dependencies..." -ForegroundColor Green
pip install -r requirements.txt --quiet

Write-Host "`nStarting FastAPI server on 0.0.0.0:8000 ..." -ForegroundColor Green
Write-Host "Waiting for phone to connect. Press Ctrl+C to stop.`n" -ForegroundColor Green

python server.py
