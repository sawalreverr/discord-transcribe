import type { Interaction } from 'discord.js';
import { handleJoin } from '../commands/join.js';
import { handleLeave } from '../commands/leave.js';
import { logger } from '../services/LoggerService.js';

export async function interactionCreateHandler(interaction: Interaction): Promise<void> {
    if (!interaction.isChatInputCommand()) return;

    const { commandName } = interaction;

    logger.info(`Received command: ${commandName} from user ${interaction.user.tag}`);

    try {
        if (commandName === 'join') {
            await handleJoin(interaction);
        } else if (commandName === 'leave') {
            await handleLeave(interaction);
        } else {
            logger.warn(`Unknown command received: ${commandName}`);
            await interaction.reply({
                content: `Unknown command: ${commandName}`,
                ephemeral: true,
            });
        }
    } catch (error) {
        logger.error(`Error handling command ${commandName}:`, error);

        if (interaction.replied || interaction.deferred) {
            await interaction.followUp({
                content: 'An error occurred while processing your command.',
                ephemeral: true,
            });
        } else {
            await interaction.reply({
                content: 'An error occurred while processing your command.',
                ephemeral: true,
            });
        }
    }
}
