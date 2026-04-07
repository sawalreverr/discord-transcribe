import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import path from 'path';

class LoggerService {
    private logger: winston.Logger;
    private transcriptLogger: winston.Logger;

    constructor(logDir: string = 'logs', level: string = 'info') {
        const logPath = path.resolve(logDir);

        const customFormat = winston.format.printf(({ level, message, timestamp }) => {
            return `${timestamp} ${level}: ${message}`;
        });

        const transcriptFormat = winston.format.printf((info) => {
            return info.message as string;
        });

        this.logger = winston.createLogger({
            level,
            format: winston.format.combine(
                winston.format.timestamp({ format: 'HH:mm:ss' }),
                winston.format.errors({ stack: true }),
                customFormat
            ),
            transports: [
                new winston.transports.Console({
                    format: winston.format.combine(winston.format.colorize(), customFormat),
                }),
                new DailyRotateFile({
                    filename: path.join(logPath, 'errors_%DATE%.log'),
                    datePattern: 'YYYY-MM-DD',
                    level: 'error',
                    maxFiles: '30d',
                }),
            ],
        });

        this.transcriptLogger = winston.createLogger({
            format: winston.format.combine(
                winston.format.timestamp({ format: 'HH:mm:ss' }),
                transcriptFormat
            ),
            transports: [
                new DailyRotateFile({
                    filename: path.join(logPath, 'transcripts_%DATE%.log'),
                    datePattern: 'YYYY-MM-DD',
                }),
            ],
        });
    }

    info(message: string, ...meta: unknown[]): void {
        this.logger.info(message, ...meta);
    }

    warn(message: string, ...meta: unknown[]): void {
        this.logger.warn(message, ...meta);
    }

    error(message: string, ...meta: unknown[]): void {
        this.logger.error(message, ...meta);
    }

    debug(message: string, ...meta: unknown[]): void {
        this.logger.debug(message, ...meta);
    }

    transcript(username: string, text: string): void {
        const formattedMessage = `[${new Date().toTimeString().slice(0, 8)}] @${username}: "${text}"`;
        this.transcriptLogger.info(formattedMessage);
    }
}

export const logger = new LoggerService();
