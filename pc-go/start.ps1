# NavAssist Go server startup script
# Run from the pc-go/ directory: .\start.ps1

$ORT_VERSION = "1.20.1"
$ORT_URL     = "https://github.com/microsoft/onnxruntime/releases/download/v$ORT_VERSION/onnxruntime-win-x64-$ORT_VERSION.zip"
$ORT_DLL     = "lib\onnxruntime.dll"
$BINARY      = "navassist.exe"

Write-Host "`nNavAssist — Go Server" -ForegroundColor Cyan

# Check for Go
if (-not (Get-Command go -ErrorAction SilentlyContinue)) {
    Write-Host "ERROR: Go not found. Install from https://go.dev/dl/" -ForegroundColor Red
    exit 1
}

# Check for gcc (required for CGO) — auto-add mingw to PATH if installed
$mingwPaths = @(
    "C:\ProgramData\mingw64\mingw64\bin",
    "C:\msys64\mingw64\bin",
    "$env:LOCALAPPDATA\msys64\mingw64\bin",
    "C:\tools\msys64\mingw64\bin"
)
foreach ($p in $mingwPaths) {
    if ((Test-Path "$p\gcc.exe") -and ($env:PATH -notlike "*$p*")) {
        $env:PATH = "$p;$env:PATH"
        Write-Host "Added gcc to PATH: $p" -ForegroundColor Green
        break
    }
}
if (-not (Get-Command gcc -ErrorAction SilentlyContinue)) {
    Write-Host "ERROR: gcc not found. CGO requires a C compiler." -ForegroundColor Red
    Write-Host "Install MinGW via Chocolatey (run as Admin):  choco install mingw" -ForegroundColor Yellow
    exit 1
}

# Download ORT shared library if missing
if (-not (Test-Path $ORT_DLL)) {
    Write-Host "Downloading ORT v$ORT_VERSION DLL (~8 MB)..." -ForegroundColor Green
    New-Item -ItemType Directory -Force lib | Out-Null
    $zip = "ort_tmp.zip"
    Invoke-WebRequest -Uri $ORT_URL -OutFile $zip
    Expand-Archive $zip -DestinationPath ort_tmp -Force
    Copy-Item "ort_tmp\onnxruntime-win-x64-$ORT_VERSION\lib\onnxruntime.dll" lib\
    Copy-Item "ort_tmp\onnxruntime-win-x64-$ORT_VERSION\lib\onnxruntime_providers_shared.dll" lib\
    Remove-Item $zip, ort_tmp -Recurse -Force
    Write-Host "ORT DLL ready." -ForegroundColor Green
}

# Check model exists
$MODEL = "model\yolov8n.onnx"
if (-not (Test-Path $MODEL)) {
    Write-Host "ERROR: model\yolov8n.onnx not found." -ForegroundColor Red
    Write-Host "Place a yolov8n.onnx file in the model\ directory and re-run." -ForegroundColor Yellow
    exit 1
}

# Resolve dependencies on first run
if (-not (Test-Path "go.sum")) {
    Write-Host "Fetching Go dependencies..." -ForegroundColor Green
    $env:CGO_ENABLED = "1"
    go mod tidy
}

# Build
Write-Host "Building navassist.exe..." -ForegroundColor Green
$env:CGO_ENABLED = "1"
Remove-Item Env:CC -ErrorAction SilentlyContinue  # clear MSVC override if set
go build -o $BINARY .\cmd\server\
if ($LASTEXITCODE -ne 0) {
    Write-Host "Build failed." -ForegroundColor Red
    exit 1
}
Write-Host "Build OK." -ForegroundColor Green

# Run
Write-Host "Starting server on 0.0.0.0:8000 ..." -ForegroundColor Green
Write-Host "Waiting for phone to connect. Press Ctrl+C to stop.`n" -ForegroundColor Green
& ".\$BINARY"
