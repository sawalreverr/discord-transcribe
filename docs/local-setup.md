# Local Transcription Setup (whisper.cpp)

## Requirements

- whisper.cpp binary + model file
- GPU recommended (AMD ROCm, NVIDIA CUDA, or Apple Metal) — CPU works but slower

## One-Command Setup

```bash
bash scripts/setup-whisper.sh
```

Auto-detects your GPU and builds accordingly:

| Backend  | Auto-detected by | Flag              |
| -------- | ---------------- | ----------------- |
| AMD ROCm | `rocm-smi`       | `rocm`            |
| NVIDIA   | `nvidia-smi`     | `cuda`            |
| Apple    | macOS            | `metal`           |
| CPU-only | fallback         | `cpu` or `native` |

Force a specific backend:

```bash
bash scripts/setup-whisper.sh large-v3-turbo cuda
```

## Manual Setup

### Linux / WSL2

```bash
git clone --depth 1 https://github.com/ggerganov/whisper.cpp.git
cd whisper.cpp

# AMD GPU (ROCm)
cmake -B build -DGGML_HIP=ON -DGGML_HIP_MMQ_MFMA=ON

# NVIDIA GPU (CUDA)
cmake -B build -DGGML_CUDA=ON

# CPU-only
cmake -B build -DGGML_NATIVE=ON

cmake --build build -j$(nproc)
bash models/download-ggml-model.sh large-v3-turbo
```

### Windows (Native)

```powershell
git clone --depth 1 https://github.com/ggerganov/whisper.cpp.git
cd whisper.cpp
cmake -B build -DGGML_NATIVE=ON
cmake --build build --config Release

# Download model
Invoke-WebRequest -Uri "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo.bin" `
  -OutFile "models\ggml-large-v3-turbo.bin"
```

Binary location on Windows: `whisper.cpp\build\bin\Release\whisper-cli.exe`

### macOS (Apple Silicon)

```bash
git clone --depth 1 https://github.com/ggerganov/whisper.cpp.git
cd whisper.cpp
cmake -B build -DGGML_METAL=ON
cmake --build build -j$(nproc)
bash models/download-ggml-model.sh large-v3-turbo
```

## .env Configuration

```env
TRANSCRIPTION_PROVIDER=local
WHISPER_CPP_PATH=./whisper.cpp/build/bin/whisper-cli
WHISPER_MODEL_PATH=./whisper.cpp/models/ggml-large-v3-turbo.bin
WHISPER_LANGUAGE=id
WHISPER_THREADS=4
WHISPER_INITIAL_PROMPT=Berikut adalah transkrip percakapan dalam bahasa Indonesia.
WHISPER_SPLIT_ON_WORD=true
WHISPER_SUPPRESS_NST=true
```

On Windows, use `.\whisper.cpp\build\bin\Release\whisper-cli.exe`.

### Accuracy settings

| Variable                 | Default                    | Purpose                                                    |
| ------------------------ | -------------------------- | ---------------------------------------------------------- |
| `WHISPER_INITIAL_PROMPT` | Bahasa Indonesia seed text | Biases the model toward the target language and vocabulary |
| `WHISPER_SPLIT_ON_WORD`  | `true`                     | Split on word boundaries instead of token boundaries       |
| `WHISPER_SUPPRESS_NST`   | `true`                     | Suppress non-speech tokens (breathing, lip-smacking)       |
| `WHISPER_THREADS`        | `4`                        | CPU threads for fallback computation                       |

### Server mode

Instead of spawning a new whisper-cli process per audio chunk, server mode keeps the model loaded in memory for much faster transcription:

```env
WHISPER_SERVER_MODE=true
WHISPER_SERVER_HOST=127.0.0.1
WHISPER_SERVER_PORT=8080
```

The bot starts and stops the whisper-server process automatically. No manual setup needed.

## Model Selection

| Model               | Size    | Accuracy  | Speed  | Best For         |
| ------------------- | ------- | --------- | ------ | ---------------- |
| large-v3-turbo      | ~1.5 GB | Excellent | Fast   | Most use cases   |
| large-v3            | ~2.9 GB | Best      | Slow   | Maximum accuracy |
| large-v3-turbo-q8_0 | ~0.9 GB | Very Good | Faster | Limited VRAM     |

> For Bahasa Indonesia, use `large-v3-turbo` or `large-v3`. Smaller models and q5_0 quantized variants lose significant accuracy on non-English languages.

## Audio Settings

```env
MAX_CHUNK_SECONDS=25    # Max audio per transcription (default: 25)
MAX_SILENCE_MS=1000      # Silence gap to split chunks (default: 1000)
```
