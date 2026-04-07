import OpenAI from 'openai';
import type { TranscriptionResult, GroqVerboseResponse } from '../types/index.js';
import { logger } from './LoggerService.js';
import { rateLimiter } from './RateLimiter.js';
import { TranscriptionError, RateLimitError } from '../utils/errors.js';

const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY_MS = 1000;
const RETRY_BACKOFF_MULTIPLIER = 2;

class GroqService {
  private client: OpenAI;
  private model: string;
  private language: string;
  private temperature: number;

  constructor(
    apiKey: string,
    model: string = 'whisper-large-v3',
    language: string = 'id',
    temperature: number = 0
  ) {
    this.client = new OpenAI({
      apiKey,
      baseURL: 'https://api.groq.com/openai/v1',
    });
    this.model = model;
    this.language = language;
    this.temperature = temperature;
  }

  async transcribe(
    audioBuffer: Buffer,
    filename: string = 'audio.wav'
  ): Promise<TranscriptionResult> {
    await rateLimiter.consume();
    logger.debug(`Transcribing audio: ${filename} (${audioBuffer.length} bytes)`);

    const file = this.bufferToFile(audioBuffer, filename);

    return this.transcribeWithRetry(file);
  }

  private async transcribeWithRetry(file: File, attempt: number = 1): Promise<TranscriptionResult> {
    try {
      const response = await this.client.audio.transcriptions.create({
        file,
        model: this.model,
        language: this.language,
        response_format: 'verbose_json',
        temperature: this.temperature,
      });

      logger.debug(`Transcription successful: ${response.text.substring(0, 50)}...`);
      return this.parseResponse(response as unknown as GroqVerboseResponse);
    } catch (error) {
      return this.handleTranscriptionError(error, file, attempt);
    }
  }

  private async handleTranscriptionError(
    error: unknown,
    file: File,
    attempt: number
  ): Promise<TranscriptionResult> {
    if (this.isRateLimitError(error)) {
      const retryAfter = this.extractRetryAfter(error);
      throw new RateLimitError(retryAfter, 'rpm');
    }

    if (this.isRetryableError(error) && attempt < MAX_RETRIES) {
      const delay = INITIAL_RETRY_DELAY_MS * Math.pow(RETRY_BACKOFF_MULTIPLIER, attempt - 1);
      logger.warn(
        `Retryable error on attempt ${attempt}/${MAX_RETRIES}. Retrying in ${delay}ms...`
      );
      await this.sleep(delay);
      return this.transcribeWithRetry(file, attempt + 1);
    }

    const message = this.extractErrorMessage(error);
    logger.error(`Transcription failed: ${message}`);
    throw new TranscriptionError(message);
  }

  private bufferToFile(buffer: Buffer, filename: string): File {
    const blob = new Blob([buffer], { type: 'audio/wav' });
    return new File([blob], filename, { type: 'audio/wav', lastModified: Date.now() });
  }

  private parseResponse(response: GroqVerboseResponse): TranscriptionResult {
    const confidence = this.calculateConfidence(response.segments);

    return {
      text: response.text.trim(),
      language: response.language,
      duration: response.duration,
      confidence,
      words: response.words || [],
      segments: response.segments || [],
    };
  }

  private calculateConfidence(segments: GroqVerboseResponse['segments']): number {
    if (!segments || segments.length === 0) {
      return 0.5;
    }

    const validSegments = segments.filter((s) => s.no_speech_prob < 0.5);
    if (validSegments.length === 0) {
      return 0.3;
    }

    const avgLogProb =
      validSegments.reduce((sum, s) => sum + s.avg_logprob, 0) / validSegments.length;
    const normalizedConfidence = Math.max(0, Math.min(1, (avgLogProb + 1) / 2));

    return Math.round(normalizedConfidence * 1000) / 1000;
  }

  private isRateLimitError(error: unknown): boolean {
    if (error instanceof Error) {
      const openaiError = error as { status?: number };
      return openaiError.status === 429;
    }
    return false;
  }

  private isRetryableError(error: unknown): boolean {
    if (error instanceof Error) {
      const openaiError = error as { status?: number };
      const status = openaiError.status;
      return status === 500 || status === 502 || status === 503 || status === 504;
    }
    return false;
  }

  private extractRetryAfter(error: unknown): number {
    if (error instanceof Error) {
      const openaiError = error as { headers?: { 'retry-after'?: string } };
      const retryAfter = openaiError.headers?.['retry-after'];
      if (retryAfter) {
        return parseInt(retryAfter, 10) * 1000;
      }
    }
    return 60000;
  }

  private extractErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }
    return 'Unknown error occurred';
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export { GroqService };

export function initGroqService(
  apiKey: string,
  model: string = 'whisper-large-v3',
  language: string = 'id',
  temperature: number = 0
): GroqService {
  return new GroqService(apiKey, model, language, temperature);
}
