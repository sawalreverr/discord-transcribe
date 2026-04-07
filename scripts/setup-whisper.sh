#!/bin/bash
# whisper.cpp setup script for Discord Transcription Bot
# Run from project root: bash scripts/setup-whisper.sh [model-size]
# Default model: large-v3 (for best accuracy)
# Available: tiny, base, small, medium, large-v3

set -e

WHISPER_DIR="./whisper.cpp"
MODEL_SIZE="${1:-large-v3}"

echo "Setting up whisper.cpp for local transcription..."

if [ ! -d "$WHISPER_DIR/.git" ]; then
    echo "Cloning whisper.cpp repository..."
    rm -rf "$WHISPER_DIR"
    git clone --depth 1 https://github.com/ggerganov/whisper.cpp.git "$WHISPER_DIR"
else
    echo "whisper.cpp already cloned, skipping..."
fi

mkdir -p "$WHISPER_DIR/models"

if [ ! -f "$WHISPER_DIR/build/bin/whisper-cli" ]; then
    echo "Building whisper.cpp with HIP support for AMD GPU..."
    cd "$WHISPER_DIR"
    rm -rf build
    cmake -B build -DGGML_HIP=ON -DGGML_HIP_MMQ_MFMA=ON
    cmake --build build -j$(nproc)
    cd - > /dev/null
else
    echo "Binary already built, skipping..."
fi

if [ ! -f "$WHISPER_DIR/models/ggml-${MODEL_SIZE}.bin" ]; then
    echo "Downloading ggml-${MODEL_SIZE} model..."
    bash "$WHISPER_DIR/models/download-ggml-model.sh" "$MODEL_SIZE"
else
    echo "Model ggml-${MODEL_SIZE}.bin already exists, skipping..."
fi

echo ""
echo "Setup complete!"
echo ""
echo "To use local transcription, add to your .env:"
echo "  TRANSCRIPTION_PROVIDER=local"
echo "  WHISPER_CPP_PATH=./whisper.cpp/build/bin/whisper-cli"
echo "  WHISPER_MODEL_PATH=./whisper.cpp/models/ggml-${MODEL_SIZE}.bin"
