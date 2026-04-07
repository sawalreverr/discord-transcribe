/**
 * Custom error classes for the Discord transcription bot
 */

/**
 * Error thrown when rate limit is exceeded
 */
export class RateLimitError extends Error {
    public readonly retryAfter: number;
    public readonly limitType: 'rpm' | 'rpd';

    constructor(retryAfter: number, limitType: 'rpm' | 'rpd') {
        const limitName = limitType === 'rpm' ? 'requests per minute' : 'requests per day';
        const retrySeconds = Math.ceil(retryAfter / 1000);
        super(`Rate limit exceeded (${limitName}). Please retry after ${retrySeconds} seconds.`);
        this.name = 'RateLimitError';
        this.retryAfter = retryAfter;
        this.limitType = limitType;
    }
}

/**
 * Error thrown when transcription fails
 */
export class TranscriptionError extends Error {
    constructor(message: string = 'Transcription failed') {
        super(message);
        this.name = 'TranscriptionError';
    }
}

/**
 * Error thrown when audio processing fails
 */
export class AudioProcessingError extends Error {
    constructor(message: string = 'Audio processing failed') {
        super(message);
        this.name = 'AudioProcessingError';
    }
}

/**
 * Error thrown when voice connection fails
 */
export class VoiceConnectionError extends Error {
    constructor(message: string = 'Voice connection failed') {
        super(message);
        this.name = 'VoiceConnectionError';
    }
}
