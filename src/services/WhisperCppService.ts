import { spawn } from 'child_process';
import { writeFileSync, readFileSync, unlinkSync, existsSync, mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import type { TranscriptionResult, TranscriptionSegment, WordTiming } from '../types/index.js';
import { TranscriptionError } from '../utils/errors.js';
import { logger } from './LoggerService.js';

interface WhisperCppJsonOutput {
  transcription: Array<{
    timestamps: { from: string; to: string };
    offsets: { from: number; to: number };
    text: string;
  }>;
}

class WhisperCppService {
  private binaryPath: string;
  private modelPath: string;
  private language: string;
  private tempDir: string;

  constructor(
    binaryPath: string = './whisper.cpp/build/bin/whisper-cli',
    modelPath: string = './whisper.cpp/models/ggml-large-v3-turbo.bin',
    language: string = 'id'
  ) {
    this.binaryPath = this.normalizeBinaryPath(binaryPath);
    this.modelPath = modelPath;
    this.language = language;
    this.tempDir = mkdtempSync(join(tmpdir(), 'whisper-'));
  }

  private normalizeBinaryPath(path: string): string {
    if (process.platform === 'win32' && !path.endsWith('.exe')) {
      return path + '.exe';
    }
    return path;
  }

  private resolveBinaryPath(): string {
    if (existsSync(this.binaryPath)) {
      return this.binaryPath;
    }
    if (process.platform === 'win32') {
      const releasePath = this.binaryPath
        .replace(/\\bin\\whisper-cli\.exe$/, '\\bin\\Release\\whisper-cli.exe')
        .replace(/\/bin\/whisper-cli\.exe$/, '/bin/Release/whisper-cli.exe');
      if (existsSync(releasePath)) {
        return releasePath;
      }
    }
    return this.binaryPath;
  }

  async transcribe(
    audioBuffer: Buffer,
    filename: string = 'audio.wav'
  ): Promise<TranscriptionResult> {
    logger.debug(`Transcribing audio with whisper.cpp: ${filename} (${audioBuffer.length} bytes)`);

    if (!this.isAvailable()) {
      const effectivePath = this.resolveBinaryPath();
      throw new TranscriptionError(
        `Whisper.cpp binary not found at ${effectivePath} or model not found at ${this.modelPath}`
      );
    }

    const tempAudioPath = join(this.tempDir, filename);
    const tempJsonPath = join(this.tempDir, `${filename}.json`);

    try {
      writeFileSync(tempAudioPath, audioBuffer);
      logger.debug(`Wrote audio to temp file: ${tempAudioPath}`);

      const args = [
        '-m',
        this.modelPath,
        '-l',
        this.language,
        '-f',
        tempAudioPath,
        '--output-json',
        '--output-file',
        tempJsonPath.replace('.json', ''),
        '--beam-size',
        '5',
        '--best-of',
        '5',
        '--temperature',
        '0.0',
        '--temperature-inc',
        '0.2',
        '--entropy-thold',
        '2.4',
        '--logprob-thold',
        '-1.0',
      ];

      const output = await this.runWhisper(args);
      logger.debug(`Whisper.cpp output: ${output.substring(0, 200)}...`);

      const result = await this.parseJsonOutput(tempJsonPath);

      this.cleanupTempFiles([tempAudioPath, tempJsonPath]);

      return result;
    } catch (error) {
      this.cleanupTempFiles([tempAudioPath, tempJsonPath]);

      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Whisper.cpp transcription failed: ${message}`);
      throw new TranscriptionError(`Whisper.cpp transcription failed: ${message}`);
    }
  }

  private async runWhisper(args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      logger.debug(`Spawning whisper.cpp: ${this.binaryPath} ${args.join(' ')}`);

      const process = spawn(this.resolveBinaryPath(), args, {
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';

      process.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      process.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      process.on('error', (error) => {
        reject(new TranscriptionError(`Failed to spawn whisper.cpp: ${error.message}`));
      });

      process.on('close', (code) => {
        if (code === 0) {
          resolve(stdout);
        } else {
          reject(new TranscriptionError(`Whisper.cpp exited with code ${code}: ${stderr}`));
        }
      });

      setTimeout(() => {
        process.kill();
        reject(new TranscriptionError('Whisper.cpp process timeout'));
      }, 60000);
    });
  }

  private async parseJsonOutput(jsonPath: string): Promise<TranscriptionResult> {
    try {
      const jsonData = readFileSync(jsonPath, 'utf-8');
      const data: WhisperCppJsonOutput = JSON.parse(jsonData);

      const segments: TranscriptionSegment[] = data.transcription.map((item, idx) => {
        const startMs = item.offsets.from;
        const endMs = item.offsets.to;
        return {
          id: idx,
          start: startMs / 1000,
          end: endMs / 1000,
          text: item.text.trim(),
          avg_logprob: 0,
          no_speech_prob: 0,
        };
      });

      const text = segments
        .map((s) => s.text)
        .join(' ')
        .trim();
      const confidence = this.calculateConfidence(segments);
      const words: WordTiming[] = this.extractWordTimings(segments);
      const duration = segments.length > 0 ? segments[segments.length - 1].end : 0;

      return {
        text,
        language: this.language,
        duration,
        confidence,
        words,
        segments,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new TranscriptionError(`Failed to parse whisper.cpp JSON output: ${message}`);
    }
  }

  private calculateConfidence(segments: TranscriptionSegment[]): number {
    if (segments.length === 0) {
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

  private extractWordTimings(segments: TranscriptionSegment[]): WordTiming[] {
    const words: WordTiming[] = [];

    for (const segment of segments) {
      const segmentWords = segment.text.split(/\s+/).filter((w) => w.length > 0);
      const segmentDuration = segment.end - segment.start;
      const wordDuration = segmentWords.length > 0 ? segmentDuration / segmentWords.length : 0;

      segmentWords.forEach((word, index) => {
        words.push({
          word,
          start: segment.start + index * wordDuration,
          end: segment.start + (index + 1) * wordDuration,
        });
      });
    }

    return words;
  }

  private cleanupTempFiles(files: string[]): void {
    for (const file of files) {
      try {
        if (existsSync(file)) {
          unlinkSync(file);
        }
      } catch (error) {
        logger.warn(`Failed to cleanup temp file ${file}: ${error}`);
      }
    }
  }

  isAvailable(): boolean {
    return existsSync(this.binaryPath) && existsSync(this.modelPath);
  }

  shutdown(): void {
    try {
      rmSync(this.tempDir, { recursive: true, force: true });
      logger.debug(`Cleaned up temp directory: ${this.tempDir}`);
    } catch (error) {
      logger.warn(`Failed to cleanup temp directory: ${error}`);
    }
  }
}

export { WhisperCppService };
