import type { Client } from 'discord.js';
import { logger } from '../services/LoggerService.js';

export async function readyHandler(client: Client): Promise<void> {
    logger.info(`Logged in as ${client.user?.tag}`);
    logger.info(`Bot is ready!`);
}
