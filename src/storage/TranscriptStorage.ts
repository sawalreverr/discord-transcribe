import { createWriteStream, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import type { TranscriptEntry } from '../types/index.js';
import { logger } from '../services/LoggerService.js';

class TranscriptStorage {
    private logDir: string;
    private writeStream: ReturnType<typeof createWriteStream> | null = null;
    private writeQueue: string[] = [];
    private isWriting: boolean = false;
    private currentDate: string | null = null;

    constructor(logDir: string = 'logs') {
        this.logDir = logDir;
        this.ensureLogDir();
    }

    private ensureLogDir(): void {
        if (!existsSync(this.logDir)) {
            mkdirSync(this.logDir, { recursive: true });
            logger.info(`Created logs directory: ${this.logDir}`);
        }
    }

    private getCurrentFilePath(): string {
        const now = new Date();
        const dateStr = this.formatDate(now);
        return join(this.logDir, `transcripts_${dateStr}.txt`);
    }

    private formatDate(date: Date): string {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    private formatTime(date: Date): string {
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        const seconds = String(date.getSeconds()).padStart(2, '0');
        return `${hours}:${minutes}:${seconds}`;
    }

    private rotateFileIfNeeded(): void {
        const now = new Date();
        const currentDateStr = this.formatDate(now);

        if (this.currentDate !== currentDateStr || !this.writeStream) {
            if (this.writeStream) {
                this.writeStream.end();
                this.writeStream = null;
            }

            const filePath = this.getCurrentFilePath();
            this.openStream(filePath);
            this.currentDate = currentDateStr;
        }
    }

    private openStream(filePath: string): void {
        this.writeStream = createWriteStream(filePath, {
            flags: 'a',
            encoding: 'utf8',
        });

        this.writeStream.on('error', (error) => {
            logger.error(`TranscriptStorage stream error: ${error.message}`);
            this.writeStream = null;
        });

        logger.debug(`Opened transcript file: ${filePath}`);
    }

    async append(entry: TranscriptEntry): Promise<void> {
        const timeStr = this.formatTime(entry.timestamp);
        const formattedEntry = `[${timeStr}] @${entry.username}: "${entry.text}"\n`;

        this.writeQueue.push(formattedEntry);
        this.processQueue();
    }

    private processQueue(): void {
        if (this.isWriting || this.writeQueue.length === 0) {
            return;
        }

        this.isWriting = true;
        this.rotateFileIfNeeded();

        if (!this.writeStream) {
            logger.error('TranscriptStorage: No write stream available');
            this.isWriting = false;
            return;
        }

        const entry = this.writeQueue.shift();

        if (!entry) {
            this.isWriting = false;
            return;
        }

        const canContinue = this.writeStream.write(entry);

        if (canContinue) {
            this.isWriting = false;
            if (this.writeQueue.length > 0) {
                setImmediate(() => this.processQueue());
            }
        } else {
            this.writeStream.once('drain', () => {
                this.isWriting = false;
                if (this.writeQueue.length > 0) {
                    this.processQueue();
                }
            });
        }
    }

    async close(): Promise<void> {
        while (this.writeQueue.length > 0) {
            await new Promise<void>((resolve) => {
                if (this.writeQueue.length === 0) {
                    resolve();
                    return;
                }

                this.processQueue();
                setTimeout(resolve, 10);
            });
        }

        if (this.writeStream) {
            await new Promise<void>((resolve) => {
                if (!this.writeStream) {
                    resolve();
                    return;
                }

                this.writeStream.end(() => {
                    logger.info('TranscriptStorage stream closed');
                    resolve();
                });
            });

            this.writeStream = null;
            this.currentDate = null;
        }
    }
}

export { TranscriptStorage };

let transcriptStorageInstance: TranscriptStorage | null = null;

export function initTranscriptStorage(logDir: string = 'logs'): void {
    transcriptStorageInstance = new TranscriptStorage(logDir);
}

export function getTranscriptStorage(): TranscriptStorage {
    if (!transcriptStorageInstance) {
        throw new Error('TranscriptStorage not initialized. Call initTranscriptStorage first.');
    }
    return transcriptStorageInstance;
}

export const transcriptStorage = {
    append: async (entry: import('../types/index.js').TranscriptEntry) => {
        return getTranscriptStorage().append(entry);
    },
    close: async () => {
        return getTranscriptStorage().close();
    },
};
