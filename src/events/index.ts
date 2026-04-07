import type { Client } from 'discord.js';
import { readyHandler } from './ready.js';
import { interactionCreateHandler } from './interactionCreate.js';

export function registerEvents(client: Client): void {
    client.on('ready', readyHandler);
    client.on('interactionCreate', interactionCreateHandler);
}
