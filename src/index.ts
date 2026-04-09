import dotenv from 'dotenv';
dotenv.config();

import { createClient } from './client.js';
import { loadConfig } from './config/index.js';
import { logger } from './services/LoggerService.js';
import { createVoiceManager } from './voice/index.js';
import { transcriptionService } from './services/TranscriptionService.js';
import { initTranscriptStorage } from './storage/TranscriptStorage.js';
import { initRateLimiter } from './services/RateLimiter.js';
import {
  initTranscriptionService,
  getWhisperServerBackend,
} from './services/TranscriptionBackend.js';
import type { Client } from 'discord.js';

let client: Client;

async function main(): Promise<void> {
  try {
    const config = loadConfig();
    logger.info('Configuration loaded');

    initRateLimiter(config.rateLimit.rpm, config.rateLimit.rpd);

    const serverMode = config.whisperCpp.serverMode;
    const serverConfig = serverMode
      ? {
          binaryPath: config.whisperCpp.binaryPath.replace('whisper-cli', 'whisper-server'),
          modelPath: config.whisperCpp.modelPath,
          language: config.whisperCpp.language,
          threads: config.whisperCpp.threads,
          initialPrompt: config.whisperCpp.initialPrompt,
          splitOnWord: config.whisperCpp.splitOnWord,
          suppressNst: config.whisperCpp.suppressNst,
          host: config.whisperCpp.serverHost,
          port: config.whisperCpp.serverPort,
        }
      : undefined;

    if (config.transcription.provider === 'groq') {
      if (!config.groq.apiKey) {
        throw new Error('GROQ_API_KEY is required when using Groq transcription provider');
      }
      await initTranscriptionService('groq', {
        groq: {
          apiKey: config.groq.apiKey,
          model: config.groq.model,
          language: config.groq.language,
        },
      });
      logger.info(`Using Groq model: ${config.groq.model}`);
    } else if (config.transcription.provider === 'local') {
      await initTranscriptionService(
        'local',
        {
          whisperCpp: {
            binaryPath: config.whisperCpp.binaryPath,
            modelPath: config.whisperCpp.modelPath,
            language: config.whisperCpp.language,
            threads: config.whisperCpp.threads,
            initialPrompt: config.whisperCpp.initialPrompt,
            splitOnWord: config.whisperCpp.splitOnWord,
            suppressNst: config.whisperCpp.suppressNst,
          },
        },
        serverMode,
        serverConfig
      );
      logger.info(serverMode ? 'Using whisper.cpp server mode' : 'Using whisper.cpp CLI mode');
    }

    initTranscriptStorage(config.log.dir);
    logger.info(`Transcript storage initialized in: ${config.log.dir}`);

    client = createClient();

    const getUsername = (guildId: string, userId: string): string => {
      if (!client) return 'Unknown User';
      const guild = client.guilds.cache.get(guildId);
      if (!guild) return 'Unknown User';
      const member = guild.members.cache.get(userId);
      return member?.displayName || member?.user.username || 'Unknown User';
    };

    const voiceManager = createVoiceManager(
      (guildId, chunk) => {
        transcriptionService.processAudioChunk(guildId, chunk);
      },
      getUsername,
      config
    );

    await client.login(config.discord.token);

    let shuttingDown = false;
    const shutdown = async () => {
      if (shuttingDown) return;
      shuttingDown = true;
      logger.info('Shutting down...');
      voiceManager.leaveAll();
      const serverBackend = getWhisperServerBackend();
      if (serverBackend) {
        serverBackend.shutdown();
      }
      await transcriptionService.shutdown();
      await client.destroy();
      process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  } catch (error) {
    logger.error('Failed to start bot:', error);
    process.exit(1);
  }
}

main();
