#!/bin/bash
# whisper.cpp setup script for Discord Transcription Bot
# Run from project root: bash scripts/setup-whisper.sh [model-size] [backend]
#
# Arguments:
#   model-size  - Model to download (default: large-v3-turbo)
#                 Available: tiny, base, small, medium, large-v3, large-v3-turbo
#   backend     - Build backend (default: auto-detect)
#                 Options: rocm, cuda, metal, cpu, native
#
# Examples:
#   bash scripts/setup-whisper.sh                       # Auto-detect GPU, large-v3-turbo
#   bash scripts/setup-whisper.sh large-v3              # Best accuracy, auto-detect GPU
#   bash scripts/setup-whisper.sh large-v3-turbo cuda   # Force CUDA build
#   bash scripts/setup-whisper.sh large-v3-turbo cpu    # Force CPU-only build

set -e

WHISPER_DIR="./whisper.cpp"
MODEL_SIZE="${1:-large-v3-turbo}"
BACKEND="${2:-auto}"

echo "=== whisper.cpp Setup ==="
echo "Model: ${MODEL_SIZE}"
echo "Backend: ${BACKEND}"
echo ""

# --- Clone whisper.cpp ---
if [ ! -d "$WHISPER_DIR/.git" ]; then
    echo "[1/3] Cloning whisper.cpp..."
    rm -rf "$WHISPER_DIR"
    git clone --depth 1 https://github.com/ggerganov/whisper.cpp.git "$WHISPER_DIR"
else
    echo "[1/3] whisper.cpp already cloned, skipping..."
fi

mkdir -p "$WHISPER_DIR/models"

# --- Detect backend ---
detect_backend() {
    if [ "$(uname -s)" = "Darwin" ]; then
        echo "metal"
        return
    fi

    # Check for NVIDIA GPU + CUDA
    if command -v nvidia-smi &>/dev/null && nvidia-smi &>/dev/null; then
        echo "cuda"
        return
    fi

    # Check for AMD GPU + ROCm
    if command -v rocm-smi &>/dev/null && rocm-smi &>/dev/null; then
        echo "rocm"
        return
    fi

    # Check for ROCm installation without GPU detected
    if [ -d "/opt/rocm" ] || [ -d "/opt/rocm" ]; then
        echo "rocm"
        return
    fi

    echo "cpu"
}

if [ "$BACKEND" = "auto" ]; then
    BACKEND=$(detect_backend)
    echo "[2/3] Detected backend: ${BACKEND}"
else
    echo "[2/3] Using specified backend: ${BACKEND}"
fi

# --- Build whisper.cpp ---
BINARY_NAME="whisper-cli"
if [ "$(uname -s)" = "Windows" ] || [ "$(uname -o 2>/dev/null)" = "Msys" ] || [ "$(uname -o 2>/dev/null)" = "Cygwin" ]; then
    BINARY_NAME="whisper-cli.exe"
fi

BINARY_PATH="$WHISPER_DIR/build/bin/$BINARY_NAME"
# Also check for Release subdirectory (Windows multi-config generators)
if [ ! -f "$BINARY_PATH" ] && [ -f "$WHISPER_DIR/build/bin/Release/$BINARY_NAME" ]; then
    BINARY_PATH="$WHISPER_DIR/build/bin/Release/$BINARY_NAME"
fi

if [ -f "$BINARY_PATH" ]; then
    echo "[2/3] Binary already built at ${BINARY_PATH}, skipping..."
else
    echo "[2/3] Building whisper.cpp with ${BACKEND} backend..."

    cd "$WHISPER_DIR"
    rm -rf build

    CMAKE_ARGS="-B build"

    case "$BACKEND" in
        rocm)
            echo "  Building with ROCm (AMD GPU)..."
            CMAKE_ARGS="$CMAKE_ARGS -DGGML_HIP=ON"
            if [ -n "$(grep -r 'MFMA' /opt/rocm/include/ 2>/dev/null | head -1)" ]; then
                CMAKE_ARGS="$CMAKE_ARGS -DGGML_HIP_MMQ_MFMA=ON"
            fi
            ;;
        cuda)
            echo "  Building with CUDA (NVIDIA GPU)..."
            CMAKE_ARGS="$CMAKE_ARGS -DGGML_CUDA=ON"
            ;;
        metal)
            echo "  Building with Metal (Apple Silicon)..."
            CMAKE_ARGS="$CMAKE_ARGS -DGGML_METAL=ON"
            ;;
        cpu|native)
            echo "  Building CPU-only (no GPU acceleration)..."
            CMAKE_ARGS="$CMAKE_ARGS -DGGML_NATIVE=ON"
            ;;
        *)
            echo "  Unknown backend '${BACKEND}', falling back to CPU-only..."
            CMAKE_ARGS="$CMAKE_ARGS -DGGML_NATIVE=ON"
            ;;
    esac

    echo "  Running: cmake $CMAKE_ARGS"
    cmake $CMAKE_ARGS

    echo "  Compiling..."
    cmake --build build -j"$(nproc 2>/dev/null || sysctl -n hw.ncpu 2>/dev/null || echo 4)"

    cd - > /dev/null

    # Re-check binary location after build
    if [ ! -f "$BINARY_PATH" ] && [ -f "$WHISPER_DIR/build/bin/Release/$BINARY_NAME" ]; then
        BINARY_PATH="$WHISPER_DIR/build/bin/Release/$BINARY_NAME"
    fi

    if [ ! -f "$BINARY_PATH" ]; then
        echo ""
        echo "ERROR: Build completed but binary not found at expected location."
        echo "Expected: $BINARY_PATH"
        echo "Look for 'whisper-cli' in $WHISPER_DIR/build/bin/ and update WHISPER_CPP_PATH in .env"
        exit 1
    fi

    echo "  Build successful: ${BINARY_PATH}"
fi

# --- Download model ---
MODEL_FILE="$WHISPER_DIR/models/ggml-${MODEL_SIZE}.bin"

if [ -f "$MODEL_FILE" ]; then
    echo "[3/3] Model ggml-${MODEL_SIZE}.bin already exists, skipping..."
else
    echo "[3/3] Downloading ggml-${MODEL_SIZE} model..."
    bash "$WHISPER_DIR/models/download-ggml-model.sh" "$MODEL_SIZE"
fi

echo ""
echo "=== Setup Complete! ==="
echo ""
echo "Add this to your .env file:"
echo ""
echo "  TRANSCRIPTION_PROVIDER=local"
echo "  WHISPER_CPP_PATH=${BINARY_PATH}"
echo "  WHISPER_MODEL_PATH=${MODEL_FILE}"
echo "  WHISPER_LANGUAGE=id"
echo ""
echo "Backend: ${BACKEND}"
echo "Model:   ${MODEL_SIZE} ($(du -h "$MODEL_FILE" 2>/dev/null | cut -f1 || echo "unknown size"))"
