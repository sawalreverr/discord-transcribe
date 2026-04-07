import type { AudioChunk, TranscriptEntry } from '../types/index.js';
import { transcriptionBackend } from './TranscriptionBackend.js';
import { transcriptStorage } from '../storage/TranscriptStorage.js';
import { logger } from './LoggerService.js';
import { AudioEncoder } from '../voice/AudioEncoder.js';

class TranscriptionService {
    private pendingTranscriptions: Map<string, boolean> = new Map();

    async processAudioChunk(_guildId: string, chunk: AudioChunk): Promise<void> {
        const { userId, username, buffer } = chunk;

        if (this.pendingTranscriptions.get(userId)) {
            logger.debug(`Skipping ${username} - transcription already in progress`);
            return;
        }

        this.pendingTranscriptions.set(userId, true);

        try {
            const wavBuffer = AudioEncoder.pcmToWav(buffer, 48000, 1);

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
        } finally {
            this.pendingTranscriptions.set(userId, false);
        }
    }

    async shutdown(): Promise<void> {
        await transcriptStorage.close();
        logger.info('TranscriptionService shut down');
    }
}

export const transcriptionService = new TranscriptionService();
