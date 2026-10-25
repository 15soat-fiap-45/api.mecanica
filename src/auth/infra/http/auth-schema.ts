import { z } from 'zod';

export const firstAccessBody = z.object({
    email: z.string(),
    temporaryPassword: z.string(),
    newPassword: z.string(),
});
export const loginBody = z.object({ email: z.string(), password: z.string() });
export const registerBody = z.object({ email: z.string(), role: z.string() });
