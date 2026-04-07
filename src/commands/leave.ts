import { SlashCommandBuilder } from 'discord.js';
import type { ChatInputCommandInteraction } from 'discord.js';
import { getVoiceManager } from '../voice/index.js';
import { logger } from '../services/LoggerService.js';

export const leaveCommand = new SlashCommandBuilder()
    .setName('leave')
    .setDescription('Leave voice channel');

export async function handleLeave(interaction: ChatInputCommandInteraction): Promise<void> {
    const voiceManager = getVoiceManager();
    if (!voiceManager) {
        await interaction.reply({
            content: 'Voice manager not initialized. Please restart the bot.',
            ephemeral: true,
        });
        return;
    }

    const guildId = interaction.guild?.id;
    if (!guildId) {
        await interaction.reply({
            content: 'This command can only be used in a server!',
            ephemeral: true,
        });
        return;
    }

    if (!voiceManager.isConnected(guildId)) {
        await interaction.reply({
            content: 'Not currently in a voice channel!',
            ephemeral: true,
        });
        return;
    }

    try {
        logger.info(`User ${interaction.user.tag} requested to leave voice channel`);

        await voiceManager.leave(guildId);

        await interaction.reply({
            content: 'Left the voice channel',
            ephemeral: false,
        });
    } catch (error) {
        logger.error('Error leaving voice channel:', error);
        await interaction.reply({
            content: 'An error occurred while leaving the voice channel.',
            ephemeral: true,
        });
    }
}
