import { joinVoiceChannel, VoiceConnection } from '@discordjs/voice';
import type { VoiceChannel } from 'discord.js';
import { logger } from '../services/LoggerService.js';
import { AudioReceiver } from './AudioReceiver.js';
import type { AudioChunk } from '../types/index.js';

export class VoiceManager {
    private connections: Map<string, VoiceConnection> = new Map();
    private receivers: Map<string, AudioReceiver> = new Map();
    private onAudioChunk: (guildId: string, chunk: AudioChunk) => void;
    private getUsername: (guildId: string, userId: string) => string;

    constructor(
        onAudioChunk: (guildId: string, chunk: AudioChunk) => void,
        getUsername: (guildId: string, userId: string) => string
    ) {
        this.onAudioChunk = onAudioChunk;
        this.getUsername = getUsername;
    }

    async join(channel: VoiceChannel): Promise<VoiceConnection> {
        const guildId = channel.guild.id;

        if (this.connections.has(guildId)) {
            await this.leave(guildId);
        }

        const connection = joinVoiceChannel({
            channelId: channel.id,
            guildId: guildId,
            adapterCreator: channel.guild.voiceAdapterCreator,
        });

        this.connections.set(guildId, connection);

        const receiver = new AudioReceiver(
            connection.receiver,
            (chunk) => this.onAudioChunk(guildId, chunk),
            (userId) => this.getUsername(guildId, userId)
        );
        this.receivers.set(guildId, receiver);

        logger.info(`Joined voice channel: ${channel.name} in guild: ${channel.guild.name}`);
        return connection;
    }

    async leave(guildId: string): Promise<void> {
        const connection = this.connections.get(guildId);
        const receiver = this.receivers.get(guildId);

        if (receiver) {
            receiver.stopAll();
        }

        if (connection) {
            connection.disconnect();
            connection.destroy();
            this.connections.delete(guildId);
        }

        this.receivers.delete(guildId);
        logger.info(`Left voice channel in guild: ${guildId}`);
    }

    isConnected(guildId: string): boolean {
        return this.connections.has(guildId);
    }

    getConnection(guildId: string): VoiceConnection | undefined {
        return this.connections.get(guildId);
    }

    getReceiver(guildId: string): AudioReceiver | undefined {
        return this.receivers.get(guildId);
    }

    getConnectedGuilds(): string[] {
        return Array.from(this.connections.keys());
    }

    async leaveAll(): Promise<void> {
        const guildIds = Array.from(this.connections.keys());
        await Promise.all(guildIds.map((guildId) => this.leave(guildId)));
    }
}

let voiceManagerInstance: VoiceManager | null = null;

export function createVoiceManager(
    onAudioChunk: (guildId: string, chunk: AudioChunk) => void,
    getUsername: (guildId: string, userId: string) => string
): VoiceManager {
    if (!voiceManagerInstance) {
        voiceManagerInstance = new VoiceManager(onAudioChunk, getUsername);
    }
    return voiceManagerInstance;
}

export function getVoiceManager(): VoiceManager | null {
    return voiceManagerInstance;
}
