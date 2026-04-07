import type { TranscriptionResult } from '../types/index.js';
import { GroqService } from './GroqService.js';
import { WhisperCppService } from './WhisperCppService.js';
import { logger } from './LoggerService.js';

export type TranscriptionProvider = 'groq' | 'local';

export interface BackendConfig {
    groq?: {
        apiKey: string;
        model: string;
        language: string;
    };
    whisperCpp?: {
        binaryPath: string;
        modelPath: string;
        language: string;
    };
}

export interface TranscriptionBackend {
    transcribe(audioBuffer: Buffer, filename?: string): Promise<TranscriptionResult>;
    isAvailable(): boolean;
}

class GroqBackend implements TranscriptionBackend {
    private service: GroqService;

    constructor(config: BackendConfig['groq']) {
        if (!config) {
            throw new Error('Groq configuration is required');
        }
        this.service = new GroqService(config.apiKey, config.model, config.language);
    }

    async transcribe(audioBuffer: Buffer, filename?: string): Promise<TranscriptionResult> {
        return this.service.transcribe(audioBuffer, filename);
    }

    isAvailable(): boolean {
        return true;
    }
}

class WhisperCppBackend implements TranscriptionBackend {
    private service: WhisperCppService;

    constructor(config: BackendConfig['whisperCpp']) {
        if (!config) {
            throw new Error('Whisper.cpp configuration is required');
        }
        this.service = new WhisperCppService(config.binaryPath, config.modelPath, config.language);
    }

    async transcribe(audioBuffer: Buffer, filename?: string): Promise<TranscriptionResult> {
        return this.service.transcribe(audioBuffer, filename);
    }

    isAvailable(): boolean {
        return this.service.isAvailable();
    }
}

class TranscriptionService {
    private backend: TranscriptionBackend;
    private provider: TranscriptionProvider;

    constructor(provider: TranscriptionProvider, config: BackendConfig) {
        this.provider = provider;

        if (provider === 'groq') {
            this.backend = new GroqBackend(config.groq);
            logger.info('Initialized Groq transcription backend');
        } else if (provider === 'local') {
            this.backend = new WhisperCppBackend(config.whisperCpp);
            if (this.backend.isAvailable()) {
                logger.info('Initialized whisper.cpp transcription backend');
            } else {
                logger.warn('Whisper.cpp backend initialized but binary or model not found');
            }
        } else {
            throw new Error(`Unknown transcription provider: ${provider}`);
        }
    }

    async transcribe(audioBuffer: Buffer, filename?: string): Promise<TranscriptionResult> {
        if (!this.backend.isAvailable()) {
            throw new Error(`Transcription backend ${this.provider} is not available`);
        }
        return this.backend.transcribe(audioBuffer, filename);
    }

    getProvider(): TranscriptionProvider {
        return this.provider;
    }

    isAvailable(): boolean {
        return this.backend.isAvailable();
    }
}

export { TranscriptionService };

let transcriptionServiceInstance: TranscriptionService | null = null;

export function initTranscriptionService(
    provider: TranscriptionProvider,
    config: BackendConfig
): void {
    transcriptionServiceInstance = new TranscriptionService(provider, config);
}

export function getTranscriptionService(): TranscriptionService {
    if (!transcriptionServiceInstance) {
        throw new Error('TranscriptionService not initialized. Call initTranscriptionService first.');
    }
    return transcriptionServiceInstance;
}

export const transcriptionBackend = {
    transcribe: async (audioBuffer: Buffer, filename?: string) => {
        return getTranscriptionService().transcribe(audioBuffer, filename);
    },
    isAvailable: () => {
        return transcriptionServiceInstance?.isAvailable() ?? false;
    },
    getProvider: () => {
        return transcriptionServiceInstance?.getProvider();
    },
};
