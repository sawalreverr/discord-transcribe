import { spawn, type ChildProcess } from 'child_process';
import { existsSync } from 'fs';
import http from 'http';
import type { TranscriptionResult, TranscriptionSegment, WordTiming } from '../types/index.js';
import { TranscriptionError } from '../utils/errors.js';
import { logger } from './LoggerService.js';

interface WhisperServerWord {
  word: string;
  start: number;
  end: number;
  probability: number;
}

interface WhisperServerSegment {
  id: number;
  text: string;
  start: number;
  end: number;
  tokens?: number[];
  words?: WhisperServerWord[];
}

interface WhisperVerboseResponse {
  task: string;
  language: string;
  duration: number;
  text: string;
  segments: WhisperServerSegment[];
}

export interface WhisperServerConfig {
  binaryPath: string;
  modelPath: string;
  language: string;
  threads: number;
  initialPrompt: string;
  splitOnWord: boolean;
  suppressNst: boolean;
  host: string;
  port: number;
}

class WhisperServerService {
  private binaryPath: string;
  private modelPath: string;
  private language: string;
  private threads: number;
  private initialPrompt: string;
  private splitOnWord: boolean;
  private suppressNst: boolean;
  private host: string;
  private port: number;
  private serverProcess: ChildProcess | null = null;
  private ready = false;

  constructor(config: WhisperServerConfig) {
    this.binaryPath = config.binaryPath || './whisper.cpp/build/bin/whisper-server';
    this.modelPath = config.modelPath || './whisper.cpp/models/ggml-large-v3-turbo.bin';
    this.language = config.language || 'id';
    this.threads = config.threads || 4;
    this.initialPrompt =
      config.initialPrompt || 'Berikut adalah transkrip percakapan dalam bahasa Indonesia.';
    this.splitOnWord = config.splitOnWord !== false;
    this.suppressNst = config.suppressNst !== false;
    this.host = config.host || '127.0.0.1';
    this.port = config.port || 8080;
  }

  private resolveBinaryPath(): string {
    let path = this.binaryPath;
    if (process.platform === 'win32' && !path.endsWith('.exe')) {
      path = path + '.exe';
    }
    if (existsSync(path)) return path;
    if (process.platform === 'win32') {
      const releasePath = path
        .replace(/\\bin\\whisper-server\.exe$/, '\\bin\\Release\\whisper-server.exe')
        .replace(/\/bin\/whisper-server\.exe$/, '/bin/Release/whisper-server.exe');
      if (existsSync(releasePath)) return releasePath;
    }
    return path;
  }

  async start(): Promise<void> {
    if (this.ready) return;

    const binaryPath = this.resolveBinaryPath();
    if (!existsSync(binaryPath)) {
      throw new TranscriptionError(`Whisper server binary not found at ${binaryPath}`);
    }
    if (!existsSync(this.modelPath)) {
      throw new TranscriptionError(`Whisper model not found at ${this.modelPath}`);
    }

    const args = [
      '-m',
      this.modelPath,
      '-l',
      this.language,
      '-t',
      String(this.threads),
      '--host',
      this.host,
      '--port',
      String(this.port),
    ];

    if (this.initialPrompt) {
      args.push('--prompt', this.initialPrompt);
    }
    if (this.splitOnWord) {
      args.push('--split-on-word');
    }
    if (this.suppressNst) {
      args.push('--suppress-nst');
    }

    logger.info(`Starting whisper-server: ${binaryPath} ${args.join(' ')}`);

    this.serverProcess = spawn(binaryPath, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    this.serverProcess.on('error', (err) => {
      logger.error(`Whisper server process error: ${err.message}`);
      this.ready = false;
    });

    this.serverProcess.on('exit', (code) => {
      logger.warn(`Whisper server process exited with code ${code}`);
      this.ready = false;
    });

    this.serverProcess.stderr?.on('data', (data) => {
      const msg = data.toString().trim();
      if (msg.includes('started') || msg.includes('listening')) {
        this.ready = true;
      }
    });

    await this.waitForReady();
    this.ready = true;
  }

  private waitForReady(timeoutMs = 30000): Promise<void> {
    return new Promise((resolve) => {
      const startTime = Date.now();
      const check = () => {
        if (this.ready) {
          resolve();
          return;
        }
        if (Date.now() - startTime > timeoutMs) {
          resolve(); // Proceed anyway — will fail on first request if not ready
          return;
        }
        // Try a health check
        const req = http.request(
          { hostname: this.host, port: this.port, path: '/health', method: 'GET', timeout: 2000 },
          (res) => {
            if (res.statusCode === 200) {
              this.ready = true;
              resolve();
            } else {
              setTimeout(check, 500);
            }
          }
        );
        req.on('error', () => setTimeout(check, 500));
        req.on('timeout', () => {
          req.destroy();
          setTimeout(check, 500);
        });
        req.end();
      };
      setTimeout(check, 500);
    });
  }

  async transcribe(
    audioBuffer: Buffer,
    filename: string = 'audio.wav'
  ): Promise<TranscriptionResult> {
    if (!this.ready) {
      throw new TranscriptionError('Whisper server is not ready');
    }

    return new Promise((resolve, reject) => {
      const boundary = `----FormBoundary${Date.now()}`;
      const filePart =
        `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="file"; filename="${filename}"\r\n` +
        `Content-Type: audio/wav\r\n\r\n`;
      const endPart = `\r\n--${boundary}--\r\n`;

      const formDataFields = [
        { name: 'temperature', value: '0.0' },
        { name: 'temperature_inc', value: '0.2' },
        { name: 'response_format', value: 'verbose_json' },
      ];
      let fieldsPart = '';
      for (const field of formDataFields) {
        fieldsPart +=
          `--${boundary}\r\n` +
          `Content-Disposition: form-data; name="${field.name}"\r\n\r\n` +
          `${field.value}\r\n`;
      }

      const body = Buffer.concat([
        Buffer.from(fieldsPart, 'utf-8'),
        Buffer.from(filePart, 'utf-8'),
        audioBuffer,
        Buffer.from(endPart, 'utf-8'),
      ]);

      const options: http.RequestOptions = {
        hostname: this.host,
        port: this.port,
        path: '/inference',
        method: 'POST',
        headers: {
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
          'Content-Length': String(body.length),
        },
        timeout: 120000,
      };

      const req = http.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk.toString();
        });
        res.on('end', () => {
          if (res.statusCode !== 200) {
            reject(new TranscriptionError(`Whisper server returned ${res.statusCode}: ${data}`));
            return;
          }
          try {
            const result = this.parseServerResponse(data);
            resolve(result);
          } catch (err) {
            reject(
              new TranscriptionError(
                `Failed to parse server response: ${err instanceof Error ? err.message : err}`
              )
            );
          }
        });
      });

      req.on('error', (err) =>
        reject(new TranscriptionError(`Whisper server request failed: ${err.message}`))
      );
      req.on('timeout', () => {
        req.destroy();
        reject(new TranscriptionError('Whisper server request timeout'));
      });

      req.write(body);
      req.end();
    });
  }

  private parseServerResponse(data: string): TranscriptionResult {
    const parsed: WhisperVerboseResponse = JSON.parse(data);

    const segments: TranscriptionSegment[] = (parsed.segments || []).map((seg, idx) => {
      const wordProbs = (seg.words || []).filter((w) => w.word.trim().length > 0);
      const avgLogProb =
        wordProbs.length > 0
          ? Math.log(wordProbs.reduce((sum, w) => sum + w.probability, 0) / wordProbs.length)
          : -1.0;

      const lowProbWords = wordProbs.filter((w) => w.probability < 0.3).length;
      const noSpeechProb = wordProbs.length > 0 ? lowProbWords / wordProbs.length : 0.5;

      return {
        id: seg.id ?? idx,
        start: seg.start,
        end: seg.end,
        text: seg.text.trim(),
        avg_logprob: avgLogProb,
        no_speech_prob: noSpeechProb,
      };
    });

    const text =
      parsed.text?.trim() ||
      segments
        .map((s) => s.text)
        .join(' ')
        .trim();
    const confidence = this.calculateConfidence(segments);
    const words = this.extractWordTimings(parsed.segments || []);
    const duration =
      parsed.duration || (segments.length > 0 ? segments[segments.length - 1].end : 0);

    return { text, language: this.language, duration, confidence, words, segments };
  }

  private calculateConfidence(segments: TranscriptionSegment[]): number {
    if (segments.length === 0) return 0.5;
    const validSegments = segments.filter((s) => s.no_speech_prob < 0.5);
    if (validSegments.length === 0) return 0.3;
    const avgLogProb =
      validSegments.reduce((sum, s) => sum + s.avg_logprob, 0) / validSegments.length;
    const normalizedConfidence = Math.max(0, Math.min(1, (avgLogProb + 1) / 2));
    return Math.round(normalizedConfidence * 1000) / 1000;
  }

  private extractWordTimings(segments: WhisperServerSegment[]): WordTiming[] {
    const words: WordTiming[] = [];
    for (const segment of segments) {
      if (!segment.words) continue;
      for (const w of segment.words) {
        const text = w.word.trim();
        if (!text) continue;
        words.push({ word: text, start: w.start, end: w.end });
      }
    }
    return words;
  }

  isAvailable(): boolean {
    return this.ready;
  }

  shutdown(): void {
    if (this.serverProcess) {
      this.serverProcess.kill('SIGTERM');
      this.serverProcess = null;
      this.ready = false;
      logger.info('Whisper server process stopped');
    }
  }
}

export { WhisperServerService };
