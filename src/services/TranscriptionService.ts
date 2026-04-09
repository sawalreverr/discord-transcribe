import type { AudioChunk, TranscriptEntry } from '../types/index.js';
import { transcriptionBackend } from './TranscriptionBackend.js';
import { transcriptStorage } from '../storage/TranscriptStorage.js';
import { logger } from './LoggerService.js';
import { AudioEncoder } from '../voice/AudioEncoder.js';

class TranscriptionService {
  private userQueues: Map<string, Promise<void>> = new Map();

  async processAudioChunk(_guildId: string, chunk: AudioChunk): Promise<void> {
    const { userId } = chunk;

    const existingQueue = this.userQueues.get(userId);
    if (existingQueue) {
      const newQueue = existingQueue.catch(() => {}).then(() => this.transcribeChunk(chunk));
      this.userQueues.set(userId, newQueue);
      newQueue.finally(() => {
        if (this.userQueues.get(userId) === newQueue) {
          this.userQueues.delete(userId);
        }
      });
      return;
    }

    const queue = this.transcribeChunk(chunk);
    this.userQueues.set(userId, queue);
    queue.finally(() => {
      if (this.userQueues.get(userId) === queue) {
        this.userQueues.delete(userId);
      }
    });
  }

  private async transcribeChunk(chunk: AudioChunk): Promise<void> {
    const { userId, username, buffer } = chunk;

    try {
      const wavBuffer = AudioEncoder.pcmToWav(buffer);

      const result = await transcriptionBackend.transcribe(
        wavBuffer,
        `${userId}_${Date.now()}.wav`
      );

      const entry: TranscriptEntry = {
        timestamp: new Date(),
        userId,
        username,
        text: result.text,
        confidence: result.confidence,
      };

      await transcriptStorage.append(entry);

      if (result.confidence) {
        logger.info(`[${username}] ${result.text} (confidence: ${result.confidence.toFixed(2)})`);
      } else {
        logger.info(`[${username}] ${result.text}`);
      }
    } catch (error) {
      logger.error(`Transcription failed for ${username}:`, error);
    }
  }

  async shutdown(): Promise<void> {
    await Promise.allSettled(this.userQueues.values());
    await transcriptStorage.close();
    logger.info('TranscriptionService shut down');
  }
}

export const transcriptionService = new TranscriptionService();
