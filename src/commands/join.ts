import { SlashCommandBuilder } from 'discord.js';
import type { ChatInputCommandInteraction, VoiceChannel } from 'discord.js';
import { getVoiceManager } from '../voice/index.js';
import { logger } from '../services/LoggerService.js';

export const joinCommand = new SlashCommandBuilder()
    .setName('join')
    .setDescription('Join voice channel');

export async function handleJoin(interaction: ChatInputCommandInteraction): Promise<void> {
    const member = interaction.guild?.members.cache.get(interaction.user.id);
    const voiceChannel = member?.voice.channel;

    if (!voiceChannel || !voiceChannel.isVoiceBased()) {
        await interaction.reply({
            content: 'You must be in a voice channel!',
            ephemeral: true,
        });
        return;
    }

    const voiceManager = getVoiceManager();
    if (!voiceManager) {
        await interaction.reply({
            content: 'Voice manager not initialized. Please restart the bot.',
            ephemeral: true,
        });
        return;
    }

    const guildId = interaction.guild!.id;
    if (voiceManager.isConnected(guildId)) {
        await interaction.reply({
            content: 'Already transcribing in this server!',
            ephemeral: true,
        });
        return;
    }

    try {
        logger.info(
            `User ${interaction.user.tag} requested to join voice channel: ${voiceChannel.name}`
        );

        await voiceManager.join(voiceChannel as VoiceChannel);

        await interaction.reply({
            content: `Joined **${voiceChannel.name}**!`,
            ephemeral: false,
        });
    } catch (error) {
        logger.error('Error joining voice channel:', error);
        await interaction.reply({
            content: 'An error occurred while joining the voice channel.',
            ephemeral: true,
        });
    }
}
