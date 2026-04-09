import 'dotenv/config';
import { z } from 'zod';

const ConfigSchema = z.object({
  discord: z.object({
    token: z.string().min(1, 'DISCORD_BOT_TOKEN is required'),
    clientId: z.string().min(1, 'DISCORD_CLIENT_ID is required'),
    testGuildId: z.string().optional(),
  }),
  transcription: z.object({
    provider: z.enum(['groq', 'local']).default('groq'),
  }),
  groq: z.object({
    apiKey: z.string().optional(),
    model: z.string().default('whisper-large-v3'),
    language: z.string().default('id'),
  }),
  whisperCpp: z.object({
    binaryPath: z.string().default('./whisper.cpp/build/bin/whisper-cli'),
    modelPath: z.string().default('./whisper.cpp/models/ggml-large-v3-turbo.bin'),
    language: z.string().default('id'),
    threads: z.number().default(4),
    initialPrompt: z
      .string()
      .default('Berikut adalah transkrip percakapan dalam bahasa Indonesia.'),
    splitOnWord: z.boolean().default(true),
    suppressNst: z.boolean().default(true),
    serverMode: z.boolean().default(false),
    serverHost: z.string().default('127.0.0.1'),
    serverPort: z.number().default(8080),
  }),
  rateLimit: z.object({
    rpm: z.number().default(6),
    rpd: z.number().default(14400),
  }),
  audio: z.object({
    maxChunkSeconds: z.number().default(25),
    maxSilenceMs: z.number().default(1000),
    sampleRate: z.number().default(16000),
  }),
  log: z.object({
    dir: z.string().default('logs'),
    level: z.string().default('info'),
  }),
});

export type Config = z.infer<typeof ConfigSchema>;

export function loadConfig(): Config {
  const configData = {
    discord: {
      token: process.env.DISCORD_BOT_TOKEN,
      clientId: process.env.DISCORD_CLIENT_ID,
      testGuildId: process.env.TEST_GUILD_ID,
    },
    transcription: {
      provider: process.env.TRANSCRIPTION_PROVIDER || 'groq',
    },
    groq: {
      apiKey: process.env.GROQ_API_KEY,
      model: process.env.GROQ_MODEL,
      language: process.env.GROQ_LANGUAGE,
    },
    whisperCpp: {
      binaryPath: process.env.WHISPER_CPP_PATH,
      modelPath: process.env.WHISPER_MODEL_PATH,
      language: process.env.WHISPER_LANGUAGE,
      threads: process.env.WHISPER_THREADS ? parseInt(process.env.WHISPER_THREADS, 10) : undefined,
      initialPrompt: process.env.WHISPER_INITIAL_PROMPT,
      splitOnWord:
        process.env.WHISPER_SPLIT_ON_WORD === 'true'
          ? true
          : process.env.WHISPER_SPLIT_ON_WORD === 'false'
            ? false
            : undefined,
      suppressNst:
        process.env.WHISPER_SUPPRESS_NST === 'true'
          ? true
          : process.env.WHISPER_SUPPRESS_NST === 'false'
            ? false
            : undefined,
      serverMode:
        process.env.WHISPER_SERVER_MODE === 'true'
          ? true
          : process.env.WHISPER_SERVER_MODE === 'false'
            ? false
            : undefined,
      serverHost: process.env.WHISPER_SERVER_HOST,
      serverPort: process.env.WHISPER_SERVER_PORT
        ? parseInt(process.env.WHISPER_SERVER_PORT, 10)
        : undefined,
    },
    rateLimit: {
      rpm: process.env.RATE_LIMIT_RPM ? parseInt(process.env.RATE_LIMIT_RPM, 10) : undefined,
      rpd: process.env.RATE_LIMIT_RPD ? parseInt(process.env.RATE_LIMIT_RPD, 10) : undefined,
    },
    audio: {
      maxChunkSeconds: process.env.MAX_CHUNK_SECONDS
        ? parseInt(process.env.MAX_CHUNK_SECONDS, 10)
        : undefined,
      maxSilenceMs: process.env.MAX_SILENCE_MS
        ? parseInt(process.env.MAX_SILENCE_MS, 10)
        : undefined,
      sampleRate: process.env.AUDIO_SAMPLE_RATE
        ? parseInt(process.env.AUDIO_SAMPLE_RATE, 10)
        : undefined,
    },
    log: {
      dir: process.env.LOG_DIR,
      level: process.env.LOG_LEVEL,
    },
  };

  try {
    const config = ConfigSchema.parse(configData);

    if (config.transcription.provider === 'groq' && !config.groq.apiKey) {
      throw new Error('GROQ_API_KEY is required when using Groq transcription provider');
    }

    return config;
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errorMessages = error.errors
        .map((err) => {
          const path = err.path.join('.');
          return `  - ${path}: ${err.message}`;
        })
        .join('\n');

      throw new Error(
        `Configuration validation failed:\n${errorMessages}\n\nPlease check your .env file against .env.example`
      );
    }
    throw error;
  }
}
