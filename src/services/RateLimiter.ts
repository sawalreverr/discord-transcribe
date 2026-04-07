import { RateLimiterMemory, RateLimiterUnion } from 'rate-limiter-flexible';
import { RateLimitError } from '../utils/errors.js';

class GroqRateLimiter {
    private rpmLimiter: RateLimiterMemory;
    private rpdLimiter: RateLimiterMemory;
    private limiter: RateLimiterUnion;

    constructor(rpm: number = 6, rpd: number = 14400) {
        this.rpmLimiter = new RateLimiterMemory({
            points: rpm,
            duration: 60,
        });

        this.rpdLimiter = new RateLimiterMemory({
            points: rpd,
            duration: 86400,
        });

        this.limiter = new RateLimiterUnion(this.rpmLimiter, this.rpdLimiter);
    }

    async consume(): Promise<void> {
        try {
            await this.limiter.consume(1);
        } catch (error: unknown) {
            if (error instanceof Error) {
                const result = await this.parseRateLimitError(error);
                if (result) {
                    throw new RateLimitError(result.msBeforeNext, result.limitType);
                }
            }
            throw error;
        }
    }

    async getMsBeforeNext(): Promise<number> {
        const rpmRes = await this.rpmLimiter.get(0);
        const rpdRes = await this.rpdLimiter.get(0);
        const rpmMs = rpmRes ? rpmRes.msBeforeNext : 0;
        const rpdMs = rpdRes ? rpdRes.msBeforeNext : 0;
        return Math.max(rpmMs, rpdMs);
    }

    private async parseRateLimitError(
        error: Error
    ): Promise<{ msBeforeNext: number; limitType: 'rpm' | 'rpd' } | null> {
        const message = error.message;
        if (!message.includes('Rate limit exceeded')) {
            return null;
        }

        const rpmMs = await this.getRemainingMs(this.rpmLimiter);
        const rpdMs = await this.getRemainingMs(this.rpdLimiter);

        if (rpmMs > 0) {
            return { msBeforeNext: rpmMs, limitType: 'rpm' };
        }
        if (rpdMs > 0) {
            return { msBeforeNext: rpdMs, limitType: 'rpd' };
        }

        return { msBeforeNext: Math.max(rpmMs, rpdMs), limitType: 'rpm' };
    }

    private async getRemainingMs(limiter: RateLimiterMemory): Promise<number> {
        const res = await limiter.get(0);
        return res ? res.msBeforeNext : 0;
    }
}

export { GroqRateLimiter };

let rateLimiterInstance: GroqRateLimiter | null = null;

export function initRateLimiter(rpm: number = 6, rpd: number = 14400): void {
    rateLimiterInstance = new GroqRateLimiter(rpm, rpd);
}

export function getRateLimiter(): GroqRateLimiter {
    if (!rateLimiterInstance) {
        rateLimiterInstance = new GroqRateLimiter();
    }
    return rateLimiterInstance;
}

export const rateLimiter = {
    consume: async () => {
        return getRateLimiter().consume();
    },
    getMsBeforeNext: async () => {
        return getRateLimiter().getMsBeforeNext();
    },
};
