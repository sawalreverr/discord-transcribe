# Discord Transcription Bot

Real-time Discord voice channel transcription bot with speaker identification. Transcribes voice audio to text using Groq API (default) or local whisper.cpp with GPU acceleration.

**For Indonesian (Bahasa) speech recognition optimized.**

---

## Features

- **Real-time Transcription** - Captures and transcribes voice audio as speakers talk
- **Speaker Identification** - Tags each transcription with the speaker's Discord username
- **Multiple Transcription Backends** - Groq API (cloud) or whisper.cpp (local with GPU)
- **Dual Transcription Support** - Groq for speed/accuracy, whisper.cpp for privacy/offline
- **Daily Rotating Logs** - Transcript files organized by date (`logs/transcripts_YYYY-MM-DD.txt`)
- **Rate Limiting** - Respects Groq free tier limits (6 requests/min, 14,400/day)
- **Indonesian Language** - Optimized for Bahasa Indonesia speech recognition

---

## Prerequisites

- **Node.js** >= 22.12.0
- **pnpm** 
- **Discord Bot Token** - [Create a bot](https://discord.com/developers/applications)
- **Groq API Key** (for cloud transcription) OR whisper.cpp (for local)

### For Local Transcription (Optional)

- **AMD GPU** with ROCm 7.2+ 
- **whisper.cpp** built with HIP support (script provided)

---

## Quick Start

### 1. Clone and Install

```bash
git clone https://github.com/sawalreverr/discord-transcribe.git
cd discord-transcribe
pnpm install
```

### 2. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` with your credentials:

```env
# Discord Bot
DISCORD_BOT_TOKEN=your_bot_token_here
DISCORD_CLIENT_ID=your_client_id_here

# Transcription Provider
TRANSCRIPTION_PROVIDER=groq

# Groq API (required for groq provider)
GROQ_API_KEY=your_groq_api_key_here
GROQ_LANGUAGE=id
```

### 3. Register Discord Commands

```bash
pnpm run build
node dist/index.js
```

The first time you run, the bot will auto-register `/join` and `/leave` commands in your test guild (if `TEST_GUILD_ID` is set) or globally (may take up to an hour).

### 4. Run the Bot

```bash
pnpm run dev
```

---

## Commands

| Command  | Description                                    |
| -------- | ---------------------------------------------- |
| `/join`  | Join your voice channel and start transcribing |
| `/leave` | Leave the voice channel and stop transcribing  |

---

## Project Structure

```
discord-transcribe/
├── src/
│   ├── index.ts              # Main entry point
│   ├── client.ts             # Discord client setup
│   ├── config/
│   │   └── index.ts          # Zod validation, environment config
│   ├── services/
│   │   ├── TranscriptionBackend.ts  # Provider switcher
│   │   ├── TranscriptionService.ts # Audio chunk processing
│   │   ├── GroqService.ts    # Groq API client
│   │   ├── WhisperCppService.ts     # Local whisper.cpp client
│   │   ├── RateLimiter.ts    # Groq rate limiting
│   │   └── LoggerService.ts  # Winston logging
│   ├── voice/
│   │   ├── VoiceManager.ts   # Voice connection manager
│   │   ├── AudioReceiver.ts  # Discord audio capture
│   │   ├── AudioBuffer.ts    # Audio buffering/silence detection
│   │   └── AudioEncoder.ts   # 48kHz→16kHz FIR downsampling
│   ├── storage/
│   │   └── TranscriptStorage.ts     # Daily rotating log files
│   ├── commands/
│   │   ├── join.ts           # /join command
│   │   └── leave.ts          # /leave command
│   ├── events/
│   │   ├── index.ts          # Event registration
│   │   ├── ready.ts          # Bot ready handler
│   │   └── interactionCreate.ts      # Command handler
│   ├── types/
│   │   └── index.ts          # TypeScript interfaces
│   └── utils/
│       ├── errors.ts         # Custom error classes
│       └── time.ts           # Time formatting utilities
├── scripts/
│   └── setup-whisper.sh      # whisper.cpp + AMD GPU setup
├── whisper.cpp/              # whisper.cpp submodule (cloned on setup)
├── .env.example              # Environment template
├── package.json
└── tsconfig.json
```

---

## Transcription Backends

### Groq (Default)

Fast, accurate transcription using Groq's cloud API with Whisper Large V3.

**Free Tier Limits:**

- 6 requests per minute
- 14,400 requests per day

**Configuration:**

```env
TRANSCRIPTION_PROVIDER=groq
GROQ_API_KEY=your_key_here
GROQ_MODEL=whisper-large-v3
GROQ_LANGUAGE=id
```

### Local (whisper.cpp)

Private, offline transcription using whisper.cpp with AMD GPU acceleration.

**Setup:**

```bash
# Run the setup script (requires AMD GPU with ROCm)
bash scripts/setup-whisper.sh large-v3
```

**Configuration:**

```env
TRANSCRIPTION_PROVIDER=local
WHISPER_CPP_PATH=./whisper.cpp/build/bin/whisper-cli
WHISPER_MODEL_PATH=./whisper.cpp/models/ggml-large-v3.bin
WHISPER_LANGUAGE=id
```

**Available Models:**
| Model | Size | Accuracy | Speed |
|-------|------|----------|-------|
| tiny | ~75 MB | Low | Fastest |
| base | ~150 MB | Medium | Fast |
| small | ~500 MB | Good | Medium |
| medium | ~1.5 GB | Better | Slow |
| large-v3 | ~2.9 GB | Best | Slowest |

---

## How It Works

1. **Voice Capture**: When `/join` is called, the bot connects to your voice channel
2. **Audio Buffering**: Audio is captured in chunks, with silence detection (100ms threshold)
3. **Downsampling**: 48kHz Discord audio → 16kHz for transcription (7-tap FIR filter)
4. **Transcription**: Audio chunk sent to Groq API or whisper.cpp
5. **Speaker Tagging**: Results tagged with Discord username from cache
6. **Log Output**: Written to `logs/transcripts_YYYY-MM-DD.txt`

**Output Format:**

```
[14:32:15] @Username: " transcription text here"
[14:32:22] @AnotherUser: " another transcription"
```

---

## Contributing

Contributions are welcome! Please follow these guidelines:

### Getting Started

1. **Fork** the repository
2. **Clone** your fork: `git clone https://github.com/sawalreverr/discord-transcribe.git`
3. **Create a branch**: `git checkout -b feature/your-feature-name`

### Reporting Bugs

Open an issue with:

- Discord bot version / commit hash
- Node.js version (`node -v`)
- Error messages
- Steps to reproduce

---

## License

MIT License - see [LICENSE](LICENSE) for details.

---

## Acknowledgments

- [whisper.cpp](https://github.com/ggerganov/whisper.cpp) - GGML-based Whisper inference
- [Groq API](https://console.groq.com/) - Fast LPU inference for speech-to-text
- [discord.js](https://discord.js.org/) - Discord API wrapper
