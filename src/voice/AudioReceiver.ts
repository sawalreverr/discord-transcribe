import { VoiceReceiver, AudioReceiveStream, EndBehaviorType } from '@discordjs/voice';
import { AudioBuffer } from './AudioBuffer.js';
import type { AudioChunk } from '../types/index.js';
import type { Config } from '../config/index.js';
import OpusScript from 'opusscript';

interface UserSession {
  userId: string;
  username: string;
  buffer: AudioBuffer;
  decoder: OpusScript;
  stream: AudioReceiveStream;
}

export class AudioReceiver {
  private sessions: Map<string, UserSession> = new Map();
  private receiver: VoiceReceiver;
  private onAudioChunk: (chunk: AudioChunk) => void;
  private getUsername: (userId: string) => string;
  private config: Config;

  constructor(
    receiver: VoiceReceiver,
    onAudioChunk: (chunk: AudioChunk) => void,
    getUsername: (userId: string) => string,
    config: Config
  ) {
    this.receiver = receiver;
    this.onAudioChunk = onAudioChunk;
    this.getUsername = getUsername;
    this.config = config;

    this.receiver.speaking.on('start', (userId) => this.startRecording(userId));
    this.receiver.speaking.on('end', (userId) => this.stopRecording(userId));
  }

  private startRecording(userId: string): void {
    if (this.sessions.has(userId)) {
      return;
    }

    const username = this.getUsername(userId);

    const stream = this.receiver.subscribe(userId, {
      end: {
        behavior: EndBehaviorType.AfterSilence,
        duration: 500,
      },
    });

    const decoder = new OpusScript(48000, 2);

    const buffer = new AudioBuffer({
      maxDuration: this.config.audio.maxChunkSeconds,
      silenceThreshold: this.config.audio.maxSilenceMs,
      minDuration: 2,
      onFlush: (pcmBuffer: Buffer, duration: number) => {
        this.onAudioChunk({
          userId,
          username,
          buffer: pcmBuffer,
          duration,
        });
      },
    });

    stream.on('data', (chunk: Buffer) => {
      try {
        const decoded = decoder.decode(chunk);
        const pcmBuffer = Buffer.from(decoded);
        const monoBuffer = this.stereoToMono(pcmBuffer);
        if (monoBuffer.length > 0) {
          buffer.add(monoBuffer);
        }
      } catch {
        // Skip malformed packets silently
      }
    });

    stream.on('end', () => {
      buffer.flush();
      this.sessions.delete(userId);
    });

    stream.on('error', (error: Error) => {
      console.error(`Audio stream error for user ${userId}:`, error);
      buffer.flush();
      this.sessions.delete(userId);
    });

    this.sessions.set(userId, {
      userId,
      username,
      buffer,
      decoder,
      stream,
    });
  }

  private stopRecording(userId: string): void {
    const session = this.sessions.get(userId);
    if (!session) {
      return;
    }

    session.buffer.flush();
    session.stream.destroy();
    try {
      session.decoder.delete();
    } catch {
      // Ignore
    }
    this.sessions.delete(userId);
  }

  updateUsername(userId: string, username: string): void {
    const session = this.sessions.get(userId);
    if (session) {
      session.username = username;
    }
  }

  stopAll(): void {
    this.destroy();
  }

  destroy(): void {
    for (const session of this.sessions.values()) {
      session.buffer.flush();
      session.stream.destroy();
      try {
        session.decoder.delete();
      } catch {
        // Ignore
      }
    }
    this.sessions.clear();
  }

  private stereoToMono(stereoBuffer: Buffer): Buffer {
    const len = stereoBuffer.length;
    if (len < 4 || len % 4 !== 0) {
      return Buffer.alloc(0);
    }
    const stereoSamplePairs = len / 4;
    const monoBuffer = Buffer.alloc(stereoSamplePairs * 2);
    for (let i = 0; i < stereoSamplePairs; i++) {
      const left = stereoBuffer.readInt16LE(i * 4);
      const right = stereoBuffer.readInt16LE(i * 4 + 2);
      monoBuffer.writeInt16LE(Math.round((left + right) / 2), i * 2);
    }
    return monoBuffer;
  }
}
