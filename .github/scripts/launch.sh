#!/usr/bin/env bash
# NavAssist launch script (release build - no Go toolchain required)
# Run from the release bundle directory: ./launch.sh
# Flags: --force-cpu   force CPU-only mode

set -euo pipefail

ORT_VERSION="1.26.0"
ORT_CUDA_URL="https://github.com/microsoft/onnxruntime/releases/download/v${ORT_VERSION}/onnxruntime-linux-x64-gpu-${ORT_VERSION}.tgz"
ORT_CUDA_LIB="lib/libonnxruntime-cuda.so"
BINARY="./navassist-server"

FORCE_CPU=0
for arg in "$@"; do [[ "$arg" == "--force-cpu" ]] && FORCE_CPU=1; done

echo ""
echo "NavAssist"

# GPU detection
GPU_NAME=""
USE_CUDA=0

if [[ $FORCE_CPU -eq 1 ]]; then
    echo "CPU mode forced (--force-cpu)."
elif command -v nvidia-smi &>/dev/null && nvidia-smi --query-gpu=name --format=csv,noheader 2>/dev/null | grep -q .; then
    GPU_NAME=$(nvidia-smi --query-gpu=name --format=csv,noheader 2>/dev/null | head -1)
    echo "GPU detected: $GPU_NAME"
else
    echo "No NVIDIA GPU detected - running in CPU mode."
fi

# Check for CUDA 12 runtime
if [[ -n "$GPU_NAME" ]]; then
    CUDA_FOUND=0
    CUDNN_FOUND=0
    SEARCH_PATHS=("/usr/lib/x86_64-linux-gnu" "/usr/local/cuda/lib64" "/usr/lib64" "${LD_LIBRARY_PATH//:/ }")
    for p in "${SEARCH_PATHS[@]}"; do
        [[ -f "$p/libcublasLt.so.12" ]] && CUDA_FOUND=1
        [[ -f "$p/libcudnn.so.9" ]]     && CUDNN_FOUND=1
    done

    if [[ $CUDA_FOUND -eq 1 && $CUDNN_FOUND -eq 1 ]]; then
        USE_CUDA=1
    elif [[ $CUDA_FOUND -eq 1 && $CUDNN_FOUND -eq 0 ]]; then
        if [[ ! -f "lib/libcudnn.so.9" ]]; then
            echo "Downloading cuDNN 9 from PyPI (~700 MB, one-time)..."
            PYPI_META=$(curl -fsSL "https://pypi.org/pypi/nvidia-cudnn-cu12/json")
            WHL_URL=$(echo "$PYPI_META" | python3 -c "
import sys, json
data = json.load(sys.stdin)
for f in data['urls']:
    if 'linux_x86_64' in f['filename']:
        print(f['url']); break
")
            curl -fsSL "$WHL_URL" -o cudnn_tmp.zip
            unzip -q cudnn_tmp.zip -d cudnn_tmp
            find cudnn_tmp -name 'libcudnn*.so*' | while read f; do cp "$f" lib/; done
            rm -rf cudnn_tmp.zip cudnn_tmp
            echo "cuDNN libs ready in lib/."
        fi
        if [[ -f "lib/libcudnn.so.9" ]]; then
            export LD_LIBRARY_PATH="$(pwd)/lib:${LD_LIBRARY_PATH:-}"
            USE_CUDA=1
        fi
    fi
    if [[ $USE_CUDA -eq 0 ]]; then
        if [[ $CUDA_FOUND -eq 0 ]]; then
            echo "CUDA 12 runtime not found - running in CPU mode."
            echo "For CUDA: install CUDA Toolkit 12.x from https://developer.nvidia.com/cuda-downloads"
        else
            echo "cuDNN 9 download failed - running in CPU mode."
        fi
    fi
fi

# Download CUDA ORT lib if needed
if [[ $USE_CUDA -eq 1 && ! -f "$ORT_CUDA_LIB" ]]; then
    echo "Downloading ORT CUDA lib (one-time)..."
    mkdir -p lib
    curl -fsSL "$ORT_CUDA_URL" -o ort_cuda_tmp.tgz
    tar -xzf ort_cuda_tmp.tgz -C /tmp/
    find /tmp -name "libonnxruntime.so.*" ! -name "*providers*" | head -1 | xargs -I{} cp {} "$ORT_CUDA_LIB"
    rm -f ort_cuda_tmp.tgz
    echo "ORT CUDA lib ready."
fi

# Run
if [[ $USE_CUDA -eq 1 ]]; then
    echo "Starting with CUDA GPU acceleration (max in-flight: 5)..."
    exec "$BINARY" -cuda -ort "$ORT_CUDA_LIB"
else
    echo "Starting in CPU mode (max in-flight: 2)..."
    exec "$BINARY"
fi
