import { Client, GatewayIntentBits } from 'discord.js';
import { registerEvents } from './events/index.js';

export function createClient(): Client {
    const client = new Client({
        intents: [
            GatewayIntentBits.Guilds,
            GatewayIntentBits.GuildMessages,
            GatewayIntentBits.GuildVoiceStates,
        ],
    });

    registerEvents(client);

    return client;
}
