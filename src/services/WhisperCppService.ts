import { spawn } from 'child_process';
import { writeFileSync, readFileSync, unlinkSync, existsSync, mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import type { TranscriptionResult, TranscriptionSegment, WordTiming } from '../types/index.js';
import { TranscriptionError } from '../utils/errors.js';
import { logger } from './LoggerService.js';

interface WhisperCppToken {
  text: string;
  timestamps: { from: string; to: string };
  offsets: { from: number; to: number };
  id: number;
  p: number;
  t_dtw: number;
}

interface WhisperCppJsonOutput {
  systeminfo: string;
  model: {
    type: string;
    multilingual: boolean;
    vocab: number;
    audio: { ctx: number; state: number; head: number; layer: number };
    text: { ctx: number; state: number; head: number; layer: number };
    mels: number;
    ftype: number;
  };
  params: {
    model: string;
    language: string;
    translate: boolean;
  };
  result: {
    language: string;
  };
  transcription: Array<{
    timestamps: { from: string; to: string };
    offsets: { from: number; to: number };
    text: string;
    tokens?: WhisperCppToken[];
  }>;
}

export interface WhisperCppConfig {
  binaryPath: string;
  modelPath: string;
  language: string;
  threads: number;
  initialPrompt: string;
  splitOnWord: boolean;
  suppressNst: boolean;
}

class WhisperCppService {
  private binaryPath: string;
  private modelPath: string;
  private language: string;
  private tempDir: string;
  private threads: number;
  private initialPrompt: string;
  private splitOnWord: boolean;
  private suppressNst: boolean;

  constructor(config: WhisperCppConfig) {
    this.binaryPath = this.normalizeBinaryPath(
      config.binaryPath || './whisper.cpp/build/bin/whisper-cli'
    );
    this.modelPath = config.modelPath || './whisper.cpp/models/ggml-large-v3-turbo.bin';
    this.language = config.language || 'id';
    this.threads = config.threads || 4;
    this.initialPrompt =
      config.initialPrompt || 'Berikut adalah transkrip percakapan dalam bahasa Indonesia.';
    this.splitOnWord = config.splitOnWord !== false;
    this.suppressNst = config.suppressNst !== false;
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

      const args = this.buildArgs(tempAudioPath, tempJsonPath);
      const output = await this.runWhisper(args);
      logger.debug(`Whisper.cpp output: ${output.substring(0, 200)}...`);

      const result = this.parseJsonOutput(tempJsonPath);

      this.cleanupTempFiles([tempAudioPath, tempJsonPath]);

      return result;
    } catch (error) {
      this.cleanupTempFiles([tempAudioPath, tempJsonPath]);

      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Whisper.cpp transcription failed: ${message}`);
      throw new TranscriptionError(`Whisper.cpp transcription failed: ${message}`);
    }
  }

  private buildArgs(audioPath: string, jsonPath: string): string[] {
    const args = [
      '-m',
      this.modelPath,
      '-l',
      this.language,
      '-f',
      audioPath,
      '--output-json-full',
      '--output-file',
      jsonPath.replace('.json', ''),
      '--beam-size',
      String(this.threads > 1 ? 5 : 3),
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
      '-t',
      String(this.threads),
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

    return args;
  }

  private async runWhisper(args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      const binaryPath = this.resolveBinaryPath();
      logger.debug(`Spawning whisper.cpp: ${binaryPath} ${args.join(' ')}`);

      const proc = spawn(binaryPath, args, {
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      proc.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      proc.on('error', (error) => {
        reject(new TranscriptionError(`Failed to spawn whisper.cpp: ${error.message}`));
      });

      proc.on('close', (code) => {
        if (code === 0) {
          resolve(stdout);
        } else {
          reject(new TranscriptionError(`Whisper.cpp exited with code ${code}: ${stderr}`));
        }
      });

      setTimeout(() => {
        proc.kill();
        reject(new TranscriptionError('Whisper.cpp process timeout'));
      }, 120000);
    });
  }

  private parseJsonOutput(jsonPath: string): TranscriptionResult {
    try {
      const jsonData = readFileSync(jsonPath, 'utf-8');
      const data: WhisperCppJsonOutput = JSON.parse(jsonData);

      const segments: TranscriptionSegment[] = data.transcription.map((item, idx) => {
        const startMs = item.offsets.from;
        const endMs = item.offsets.to;

        // Compute confidence from token probabilities
        const tokens = item.tokens || [];
        const meaningfulTokens = tokens.filter(
          (t) => t.text.trim().length > 0 && !t.text.startsWith('[_')
        );
        const avgLogProb =
          meaningfulTokens.length > 0
            ? Math.log(meaningfulTokens.reduce((sum, t) => sum + t.p, 0) / meaningfulTokens.length)
            : -1.0;

        // Estimate no_speech_prob from token count vs segment duration
        // Tokens with very low probability indicate no-speech segments
        const lowProbTokens = meaningfulTokens.filter((t) => t.p < 0.3).length;
        const noSpeechProb =
          meaningfulTokens.length > 0 ? lowProbTokens / meaningfulTokens.length : 0.5;

        return {
          id: idx,
          start: startMs / 1000,
          end: endMs / 1000,
          text: item.text.trim(),
          avg_logprob: avgLogProb,
          no_speech_prob: noSpeechProb,
        };
      });

      const text = segments
        .map((s) => s.text)
        .join(' ')
        .trim();

      const confidence = this.calculateConfidence(segments);
      const words: WordTiming[] = this.extractWordTimings(data.transcription);
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

  private extractWordTimings(transcription: WhisperCppJsonOutput['transcription']): WordTiming[] {
    const words: WordTiming[] = [];

    for (const segment of transcription) {
      if (!segment.tokens) continue;

      for (const token of segment.tokens) {
        const text = token.text.trim();
        if (!text || text.startsWith('[_')) continue;
        if (token.offsets.from === 0 && token.offsets.to === 0) continue;

        words.push({
          word: text,
          start: token.offsets.from / 1000,
          end: token.offsets.to / 1000,
        });
      }
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
    return existsSync(this.resolveBinaryPath()) && existsSync(this.modelPath);
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
