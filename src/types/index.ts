export interface TranscriptEntry {
    timestamp: Date;
    userId: string;
    username: string;
    text: string;
    confidence?: number;
}

export interface AudioChunk {
    userId: string;
    username: string;
    buffer: Buffer;
    duration: number;
}

/**
 * Individual word with timing information
 */
export interface WordTiming {
    word: string;
    start: number; // Start time in seconds
    end: number; // End time in seconds
}

/**
 * Segment of transcription with metadata
 */
export interface TranscriptionSegment {
    id: number;
    start: number; // Start time in seconds
    end: number; // End time in seconds
    text: string;
    avg_logprob: number; // Average log probability (confidence indicator)
    no_speech_prob: number; // Probability of no speech (< 0.1 means definitely speech)
}

export interface TranscriptionResult {
    text: string;
    language: string;
    duration: number;
    confidence: number; // Overall confidence score (0-1)
    words: WordTiming[]; // Word-level timing
    segments: TranscriptionSegment[]; // Segment-level information
}

export interface UserSession {
    userId: string;
    username: string;
    joinedAt: Date;
}

export interface GroqVerboseResponse {
    text: string;
    task: 'transcribe';
    language: string;
    duration: number;
    words: Array<{
        word: string;
        start: number;
        end: number;
    }>;
    segments: Array<{
        id: number;
        start: number;
        end: number;
        text: string;
        avg_logprob: number;
        no_speech_prob: number;
    }>;
}
