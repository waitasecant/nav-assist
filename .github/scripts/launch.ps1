# NavAssist launch script (release build - no Go toolchain required)
# Run from the release bundle directory: .\launch.ps1
# Flags: -ForceCPU       force CPU-only mode
#         -ForceDirectML  force DirectML even on NVIDIA (skips CUDA)

param(
    [switch]$ForceCPU,
    [switch]$ForceDirectML
)

$ORT_VERSION  = "1.26.0"
$ORT_DML_URL  = "https://www.nuget.org/api/v2/package/Microsoft.ML.OnnxRuntime.DirectML/$ORT_VERSION"
$ORT_CUDA_URL = "https://github.com/microsoft/onnxruntime/releases/download/v${ORT_VERSION}/onnxruntime-win-x64-gpu-${ORT_VERSION}.zip"
$ORT_DML_DLL  = "lib\onnxruntime-directml.dll"
$ORT_CUDA_DLL = "lib\onnxruntime-cuda.dll"
$BINARY       = "navassist-server.exe"

Write-Host "`nNavAssist" -ForegroundColor Cyan

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
        Write-Host "No GPU detected - running in CPU mode." -ForegroundColor Yellow
    }
}

$useGPU    = $null -ne $gpuName
$useNVIDIA = $useGPU -and ($gpuName -match "NVIDIA") -and -not $ForceDirectML

# Check for CUDA 12 runtime + cuDNN 9
$cudaBinDir  = $null
$cudnnBinDir = $null

if ($useNVIDIA) {
    $cudaSearchPaths = @("lib")
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

    $cudaAvailable = ($null -ne $cudaBinDir) -and ($null -ne $cudnnBinDir)
    if (-not $cudaAvailable -and $cudaBinDir) {
        if (-not (Test-Path "lib\cudnn64_9.dll")) {
            Write-Host "Downloading cuDNN 9 from PyPI (~700 MB, one-time)..." -ForegroundColor Green
            $meta   = Invoke-RestMethod "https://pypi.org/pypi/nvidia-cudnn-cu12/json"
            $whlUrl = ($meta.urls | Where-Object { $_.filename -like "*win_amd64*" } | Select-Object -First 1).url
            Invoke-WebRequest -Uri $whlUrl -OutFile "cudnn_tmp.zip"
            Expand-Archive "cudnn_tmp.zip" -DestinationPath cudnn_tmp -Force
            Get-ChildItem "cudnn_tmp\nvidia\cudnn\bin\*.dll" | ForEach-Object { Copy-Item $_.FullName lib\ -Force }
            Remove-Item "cudnn_tmp.zip", cudnn_tmp -Recurse -Force
            Write-Host "cuDNN DLLs ready in lib/." -ForegroundColor Green
        }
        if (Test-Path "lib\cudnn64_9.dll") { $cudnnBinDir = (Resolve-Path "lib").Path }
        $cudaAvailable = ($null -ne $cudaBinDir) -and ($null -ne $cudnnBinDir)
    }
    if (-not $cudaAvailable) {
        Write-Host "CUDA 12 runtime not found - falling back to DirectML." -ForegroundColor Yellow
        Write-Host "For CUDA: install CUDA Toolkit 12.x from https://developer.nvidia.com/cuda-downloads" -ForegroundColor Yellow
        $useNVIDIA = $false
    } else {
        foreach ($d in @($cudaBinDir, $cudnnBinDir) | Where-Object { $_ } | Select-Object -Unique) {
            if ($env:PATH -notlike "*$d*") { $env:PATH = "$d;$env:PATH" }
        }
    }
}

# Download CUDA ORT DLL if needed
if ($useNVIDIA -and -not (Test-Path $ORT_CUDA_DLL)) {
    Write-Host "Downloading ORT CUDA DLL (one-time)..." -ForegroundColor Green
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

# Download DirectML ORT DLL if needed
if ($useGPU -and -not $useNVIDIA -and -not (Test-Path $ORT_DML_DLL)) {
    Write-Host "Downloading ORT DirectML DLL..." -ForegroundColor Green
    New-Item -ItemType Directory -Force lib | Out-Null
    $nupkg = "ort_dml_tmp.nupkg"
    Invoke-WebRequest -Uri $ORT_DML_URL -OutFile $nupkg
    Expand-Archive $nupkg -DestinationPath ort_dml_tmp -Force
    Copy-Item "ort_dml_tmp\runtimes\win-x64\native\onnxruntime.dll" $ORT_DML_DLL
    Remove-Item $nupkg, ort_dml_tmp -Recurse -Force
    Write-Host "DirectML DLL ready." -ForegroundColor Green
}

# Run
$runArgs = @()
if ($useNVIDIA) {
    Write-Host "Starting with CUDA GPU acceleration (max in-flight: 5)..." -ForegroundColor Green
    $runArgs += "-cuda"
} elseif ($useGPU) {
    Write-Host "Starting with DirectML GPU acceleration (max in-flight: 5)..." -ForegroundColor Green
    $runArgs += "-directml"
} else {
    Write-Host "Starting in CPU mode (max in-flight: 2)..." -ForegroundColor Green
}

Write-Host "Waiting for phone to connect. Press Ctrl+C to stop.`n" -ForegroundColor Green
& ".\$BINARY" @runArgs
