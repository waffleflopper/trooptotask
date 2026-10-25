import { z } from 'zod';

const rowSchema = z.object({
	isOpen: z.boolean(),
	id: z.string(),
	requestId: z.string(),
	name: z.string(),
	email: z.string(),
	reason: z.enum(['bounced', 'expiredUnused']),
	failedAt: z.string(),
	closedAt: z.string().nullable(),
	bounceReason: z.string().nullable(),
	expiresAt: z.string(),
	createdAt: z.string(),
	claimedAt: z.string().nullable(),
	revokedAt: z.string().nullable(),
	completedAt: z.string().nullable(),
	status: z.string()
});
export const setupEmailPageSchema = z.object({ count: z.number().int().nonnegative(), rows: z.array(rowSchema) });
export type SetupEmailInboxRow = z.infer<typeof rowSchema>;
