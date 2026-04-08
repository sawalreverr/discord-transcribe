export interface AudioBufferOptions {
  maxDuration?: number;
  silenceThreshold?: number;
  minDuration?: number;
  onFlush: (buffer: Buffer, duration: number) => void;
}

export class AudioBuffer {
  private chunks: Buffer[] = [];
  private lastAudioTime: number = Date.now();
  private silenceTimer: NodeJS.Timeout | null = null;
  private readonly options: Required<AudioBufferOptions>;

  private static readonly BYTES_PER_SECOND = 96000;

  constructor(options: AudioBufferOptions) {
    this.options = {
      maxDuration: options.maxDuration ?? 25,
      silenceThreshold: options.silenceThreshold ?? 2000,
      minDuration: options.minDuration ?? 2,
      onFlush: options.onFlush,
    };
  }

  add(pcmChunk: Buffer): void {
    if (pcmChunk.length === 0) {
      return;
    }

    this.chunks.push(pcmChunk);
    this.lastAudioTime = Date.now();

    const duration = this.getDuration();
    if (duration >= this.options.maxDuration) {
      this.flush();
      return;
    }

    this.resetSilenceTimer();
  }

  flush(): void {
    this.clearSilenceTimer();

    if (this.chunks.length === 0) {
      return;
    }

    const duration = this.getDuration();
    if (duration < this.options.minDuration) {
      this.chunks = [];
      return;
    }

    const buffer = Buffer.concat(this.chunks);
    this.chunks = [];
    this.options.onFlush(buffer, duration);
  }

  getDuration(): number {
    const totalBytes = this.chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    return totalBytes / AudioBuffer.BYTES_PER_SECOND;
  }

  clear(): void {
    this.clearSilenceTimer();
    this.chunks = [];
  }

  private resetSilenceTimer(): void {
    this.clearSilenceTimer();

    this.silenceTimer = setTimeout(() => {
      const timeSinceLastAudio = Date.now() - this.lastAudioTime;
      if (timeSinceLastAudio >= this.options.silenceThreshold) {
        this.flush();
      }
    }, this.options.silenceThreshold);
  }

  private clearSilenceTimer(): void {
    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
    }
  }
}
