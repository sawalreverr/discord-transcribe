# Discord Transcription Bot

Real-time Discord voice transcription with speaker identification. Supports Groq API (cloud) and whisper.cpp (local/offline).

Optimized for **Bahasa Indonesia**

## Quick Start

```bash
git clone https://github.com/sawalreverr/discord-transcribe.git
cd discord-transcribe
pnpm install
cp .env.example .env
# Edit .env with your bot token and API key
pnpm run dev
```

## Commands

| Command  | Description        |
| -------- | ------------------ |
| `/join`  | Start transcribing |
| `/leave` | Stop transcribing  |

## Configuration

```env
DISCORD_BOT_TOKEN=your_bot_token
DISCORD_CLIENT_ID=your_client_id
TRANSCRIPTION_PROVIDER=local    # "groq" or "local"
GROQ_API_KEY=your_key            # required for groq
```

For local whisper.cpp setup, GPU support, and all config options, see [docs/local-setup.md](docs/local-setup.md).

## Output

```
[14:32:15] @Username: " transcription text"
[14:32:22] @AnotherUser: " more text"
```

Logs are written to `logs/transcripts_YYYY-MM-DD.txt`.

## Architecture

```
Discord Voice → AudioReceiver → AudioBuffer → AudioEncoder (48→16kHz)
    → TranscriptionBackend (Groq or whisper.cpp) → TranscriptStorage
```

## Contributing

1. Fork the repo
2. Create a branch: `git checkout -b feature/your-feature`
3. Open a PR

Report bugs with: bot version, Node.js version (`node -v`), error messages, and steps to reproduce.

## License

MIT
