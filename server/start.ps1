# NavAssist Go server startup script
# Run from the server/ directory: .\start.ps1
# Flags: -ForceCPU       force CPU-only mode even when a GPU is detected
#         -ForceDirectML  force DirectML even on NVIDIA (skips CUDA)

param(
    [switch]$ForceCPU,
    [switch]$ForceDirectML
)

$ORT_VERSION     = "1.26.0"
$ORT_URL         = "https://github.com/microsoft/onnxruntime/releases/download/v$ORT_VERSION/onnxruntime-win-x64-$ORT_VERSION.zip"
$ORT_DML_URL     = "https://www.nuget.org/api/v2/package/Microsoft.ML.OnnxRuntime.DirectML/$ORT_VERSION"
$ORT_CUDA_URL    = "https://github.com/microsoft/onnxruntime/releases/download/v$ORT_VERSION/onnxruntime-win-x64-gpu-$ORT_VERSION.zip"
$ORT_DLL         = "lib\onnxruntime.dll"
$ORT_DML_DLL     = "lib\onnxruntime-directml.dll"
$ORT_CUDA_DLL    = "lib\onnxruntime-cuda.dll"
$BINARY          = "navassist.exe"

Write-Host "`nNavAssist - Go Server" -ForegroundColor Cyan

# GPU detection - skip Basic Display / virtual adapters
$gpuName = $null
if ($ForceCPU) {
    Write-Host "CPU mode forced (-ForceCPU)." -ForegroundColor Yellow
} else {
    $gpus = Get-WmiObject Win32_VideoController -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -notmatch "Microsoft Basic Display|Remote Desktop|Citrix|VMware|VirtualBox|Hyper-V" }
    if ($gpus) {
        $gpuName = ($gpus | Select-Object -First 1).Name
        Write-Host "GPU detected: $gpuName" -ForegroundColor Green
    } else {
        Write-Host "No discrete/integrated GPU detected - running in CPU mode." -ForegroundColor Yellow
    }
}
$useGPU = $null -ne $gpuName
$useNVIDIA = $useGPU -and ($gpuName -match "NVIDIA") -and -not $ForceDirectML

# Check if CUDA 12 runtime + cuDNN 9 DLLs are present.
$cudaBinDir  = $null
$cudnnBinDir = $null

$cudaSearchPaths = @("$env:SystemRoot\System32", "$env:SystemRoot\SysWOW64", "lib")
if ($env:CUDA_PATH) { $cudaSearchPaths += "$env:CUDA_PATH\bin" }
Get-ChildItem "C:\Program Files\NVIDIA GPU Computing Toolkit\CUDA" -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -match "^v12\." } |
    ForEach-Object { $cudaSearchPaths += "$($_.FullName)\bin" }
($env:PATH -split ";") | ForEach-Object { $cudaSearchPaths += $_ }

foreach ($p in $cudaSearchPaths) {
    if (-not $cudaBinDir  -and (Test-Path "$p\cublasLt64_12.dll")) { $cudaBinDir  = $p }
    if (-not $cudnnBinDir -and (Test-Path "$p\cudnn64_9.dll"))     { $cudnnBinDir = $p }
    if ($cudaBinDir -and $cudnnBinDir) { break }
}

# Auto-install cuDNN via pip if CUDA is present but cuDNN is missing
if ($useNVIDIA -and $cudaBinDir -and -not $cudnnBinDir) {
    # Check pip-installed location before attempting install
    $cudnnPipBin = python -c "import sys,os; [print(os.path.join(p,'nvidia','cudnn','bin')) for p in sys.path if os.path.exists(os.path.join(p,'nvidia','cudnn','bin','cudnn64_9.dll'))]" 2>$null | Select-Object -First 1
    if (-not $cudnnPipBin) {
        Write-Host "cuDNN 9 not found - installing via pip (~500 MB, one-time)..." -ForegroundColor Green
        pip install nvidia-cudnn-cu12 --quiet 2>$null
        $cudnnPipBin = python -c "import sys,os; [print(os.path.join(p,'nvidia','cudnn','bin')) for p in sys.path if os.path.exists(os.path.join(p,'nvidia','cudnn','bin','cudnn64_9.dll'))]" 2>$null | Select-Object -First 1
    }
    if ($cudnnPipBin -and (Test-Path "$cudnnPipBin\cudnn64_9.dll")) {
        $cudnnBinDir = $cudnnPipBin
        Write-Host "cuDNN ready." -ForegroundColor Green
    } else {
        Write-Host "cuDNN install failed - run: pip install nvidia-cudnn-cu12" -ForegroundColor Yellow
    }
}

$cudaAvailable = ($null -ne $cudaBinDir) -and ($null -ne $cudnnBinDir)

# Prepend CUDA and cuDNN bin dirs to PATH so ORT provider DLLs can locate them at runtime
foreach ($d in @($cudaBinDir, $cudnnBinDir) | Where-Object { $_ } | Select-Object -Unique) {
    if ($env:PATH -notlike "*$d*") {
        $env:PATH = "$d;$env:PATH"
        Write-Host "Added to PATH: $d" -ForegroundColor Green
    }
}

if ($useNVIDIA -and -not $cudaAvailable) {
    Write-Host "CUDA 12 runtime not found - using DirectML instead." -ForegroundColor Yellow
    Write-Host "For CUDA: install CUDA Toolkit 12.x (Runtime component only):" -ForegroundColor Yellow
    Write-Host "  https://developer.nvidia.com/cuda-downloads" -ForegroundColor Yellow
    $useNVIDIA = $false
}

# Check for Go
if (-not (Get-Command go -ErrorAction SilentlyContinue)) {
    Write-Host "ERROR: Go not found. Install from https://go.dev/dl/" -ForegroundColor Red
    exit 1
}

# Check for gcc (required for CGO) - auto-add mingw to PATH if installed
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

# Download standard ORT DLL if missing
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

# Download CUDA ORT DLL if NVIDIA GPU detected
if ($useNVIDIA -and -not (Test-Path $ORT_CUDA_DLL)) {
    Write-Host "Downloading ORT CUDA v$ORT_VERSION DLL (~600 MB, one-time)..." -ForegroundColor Green
    New-Item -ItemType Directory -Force lib | Out-Null
    $zip = "ort_cuda_tmp.zip"
    Invoke-WebRequest -Uri $ORT_CUDA_URL -OutFile $zip
    Expand-Archive $zip -DestinationPath ort_cuda_tmp -Force
    $srcLib = "ort_cuda_tmp\onnxruntime-win-x64-gpu-$ORT_VERSION\lib"
    Copy-Item "$srcLib\onnxruntime.dll" $ORT_CUDA_DLL
    Get-ChildItem "$srcLib\*.dll" | Where-Object { $_.Name -ne "onnxruntime.dll" } |
        ForEach-Object { Copy-Item $_.FullName lib\ -Force }
    Remove-Item $zip, ort_cuda_tmp -Recurse -Force
    Write-Host "ORT CUDA DLL ready." -ForegroundColor Green
}

# Download DirectML ORT DLL for non-NVIDIA GPUs
if ($useGPU -and -not $useNVIDIA -and -not (Test-Path $ORT_DML_DLL)) {
    Write-Host "Downloading ORT DirectML v$ORT_VERSION DLL..." -ForegroundColor Green
    New-Item -ItemType Directory -Force lib | Out-Null
    $nupkg = "ort_dml_tmp.nupkg"
    Invoke-WebRequest -Uri $ORT_DML_URL -OutFile $nupkg
    Expand-Archive $nupkg -DestinationPath ort_dml_tmp -Force
    Copy-Item "ort_dml_tmp\runtimes\win-x64\native\onnxruntime.dll" $ORT_DML_DLL
    Remove-Item $nupkg, ort_dml_tmp -Recurse -Force
    Write-Host "DirectML DLL ready." -ForegroundColor Green
}

# Check YOLO model exists
$MODEL_FP32 = "..\model\yolov8n.onnx"
$MODEL_INT8 = "..\model\yolov8n_int8.onnx"
if (-not (Test-Path $MODEL_FP32)) {
    Write-Host "ERROR: model\yolov8n.onnx not found." -ForegroundColor Red
    Write-Host "Run .\setup.ps1 from the tools\ directory to export it." -ForegroundColor Yellow
    exit 1
}

# Choose model: prefer INT8 if available, fall back to FP32
$modelPath = $MODEL_FP32
if (Test-Path $MODEL_INT8) {
    $modelPath = $MODEL_INT8
    Write-Host "Using INT8 quantized model." -ForegroundColor Green
}

# Download MiDaS depth model if missing
$DEPTH_MODEL = "..\model\midas_small.onnx"
if (-not (Test-Path $DEPTH_MODEL)) {
    Write-Host "Downloading MiDaS depth model (~80 MB)..." -ForegroundColor Green
    Invoke-WebRequest -Uri "https://github.com/isl-org/MiDaS/releases/download/v2_1/model-small.onnx" -OutFile $DEPTH_MODEL
    Write-Host "Depth model ready." -ForegroundColor Green
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
$runArgs = @("-model", $modelPath)
if ($useNVIDIA) {
    Write-Host "Starting server with CUDA GPU acceleration (max in-flight: 5)..." -ForegroundColor Green
    $runArgs += "-cuda"
} elseif ($useGPU) {
    Write-Host "Starting server with DirectML GPU acceleration (max in-flight: 5)..." -ForegroundColor Green
    $runArgs += "-directml"
} else {
    Write-Host "Starting server in CPU mode (max in-flight: 2)..." -ForegroundColor Green
}
Write-Host "Waiting for phone to connect. Press Ctrl+C to stop.`n" -ForegroundColor Green
& ".\$BINARY" @runArgs
