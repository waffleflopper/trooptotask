import { z } from 'zod';

export const personStateSchema = z.discriminatedUnion('kind', [
	z.object({ kind: z.literal('active'), userId: z.string() }),
	z.object({ kind: z.literal('suspended'), userId: z.string(), reason: z.string(), suspendedAt: z.string() }),
	z.object({
		kind: z.literal('notSetUp'),
		requestId: z.string(),
		approvedAt: z.string(),
		linkExpiresAt: z.string().nullable()
	})
]);
const personSchema = z.object({
	id: z.string(),
	name: z.string(),
	email: z.string().nullable(),
	createdAt: z.string(),
	lastSignInAt: z.string().nullable(),
	emailConfirmedAt: z.string().nullable(),
	organizationCount: z.number().int().nonnegative(),
	state: personStateSchema
});
export const peoplePageSchema = z.object({
	people: z.array(personSchema),
	totalCount: z.number().int().nonnegative(),
	page: z.number().int().positive(),
	limit: z.number().int().positive()
});
export type PersonState = z.infer<typeof personStateSchema>;
export type IdentityPerson = z.infer<typeof personSchema>;
export type IdentityPeoplePage = z.infer<typeof peoplePageSchema>;
export type PeopleFilter = 'all' | 'notSetUp' | 'suspended';
export const PEOPLE_SORT_KEYS = ['person', 'organizations', 'lastSignIn', 'status', 'added'] as const;
export type PeopleSortKey = (typeof PEOPLE_SORT_KEYS)[number];
export interface PeopleSort {
	key: PeopleSortKey;
	direction: 'asc' | 'desc';
}
export interface PeopleQuery {
	search: string;
	filter: PeopleFilter;
	sort: PeopleSort;
	page: number;
	limit: number;
}

export const personAccessHistorySchema = z.object({
	id: z.string(),
	name: z.string(),
	email: z.string(),
	status: z.enum(['pending', 'approved', 'rejected', 'rescinded']),
	created_at: z.string(),
	reviewed_at: z.string().nullable(),
	setup_completed_at: z.string().nullable(),
	rescinded_at: z.string().nullable()
});
export const personAccessRequestSchema = personAccessHistorySchema.extend({
	reason: z.string().nullable(),
	heard_about: z.string().nullable(),
	heard_about_details: z.string().nullable(),
	setup_grant_live: z.boolean()
});
export const setupTimelineSchema = z.array(
	z.object({
		id: z.string(),
		created_at: z.string(),
		expires_at: z.string(),
		claimed_at: z.string().nullable(),
		used_at: z.string().nullable(),
		failed_at: z.string().nullable(),
		failure_reason: z.string().nullable(),
		revoked_at: z.string().nullable(),
		revocation_reason: z.string().nullable(),
		bounced_at: z.string().nullable(),
		bounce_reason: z.string().nullable(),
		deliveries: z.array(
			z.object({
				id: z.string(),
				status: z.enum(['pending', 'sent', 'failed']),
				attempt_count: z.number().int().nonnegative(),
				created_at: z.string(),
				updated_at: z.string(),
				sent_at: z.string().nullable(),
				last_error: z.string().nullable()
			})
		)
	})
);
export type SetupEmailTimeline = z.infer<typeof setupTimelineSchema>;
export type PersonAccessHistory = z.infer<typeof personAccessHistorySchema>;
export type PersonAccessRequest = z.infer<typeof personAccessRequestSchema>;
