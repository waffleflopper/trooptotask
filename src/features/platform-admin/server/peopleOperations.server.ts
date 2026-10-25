import type { RequestEvent } from '@sveltejs/kit';
import { createIdentityPlatformSupportReader, createIdentityPersonReader } from '$features/identity/index.server';
import type { PeopleQuery, PersonState } from '$features/identity/contracts';
import { createOrganizationSupportReader } from '$features/organization/index.server';
import { createSupabasePlatformAudit } from '$lib/audit/index.server';
import { describeAuditEvent } from '../auditSentences';
import { admitPlatformAdministrator } from './admission.server';

export type PersonRegion<T> = { status: 'ok'; data: T } | { status: 'error'; message: string };
export async function readPersonRegion<T>(read: () => Promise<T>, message: string): Promise<PersonRegion<T>> {
	try {
		return { status: 'ok', data: await read() };
	} catch {
		return { status: 'error', message };
	}
}

export async function createPlatformPeopleOperations(event: RequestEvent) {
	const { actor, adminClient } = await admitPlatformAdministrator(event);
	const identity = createIdentityPlatformSupportReader(adminClient);
	const facts = createIdentityPersonReader(adminClient);
	const organizations = createOrganizationSupportReader(adminClient);
	const audit = createSupabasePlatformAudit(adminClient);
	return {
		adminUserId: actor.userId,
		list: (input: PeopleQuery) => readPersonRegion(() => identity.listPeople(input), 'Unable to load People'),
		async account(userId: string) {
			const [account, suspension] = await Promise.all([
				identity.getAuthUser(userId),
				identity.getSuspensionForUser(userId)
			]);
			if (account.status !== 'ok') return account;
			const state: PersonState = suspension
				? { kind: 'suspended', userId, reason: suspension.reason ?? '', suspendedAt: suspension.suspendedAt }
				: { kind: 'active', userId };
			return { status: 'ok' as const, person: { ...account.user, state }, suspension };
		},
		accountFacts: (userId: string) => readPersonRegion(() => facts.accountFacts(userId), 'Unable to load account name'),
		organizations: (userId: string) =>
			readPersonRegion(() => organizations.listMembershipsForUser(userId), 'Unable to load Organizations'),
		accessHistory: (email: string) => readPersonRegion(() => facts.history(email), 'Unable to load access history'),
		recentActivity: (userId: string) =>
			readPersonRegion(
				async () =>
					(await audit.listRecentByUser({ userId, limit: 10 })).map((row) => ({
						...row,
						...describeAuditEvent({ ...row, orgName: null }, { viewerId: actor.userId })
					})),
				'Unable to load recent activity'
			),
		request: facts.request,
		setupTimeline: (requestId: string) =>
			readPersonRegion(() => facts.setupTimeline(requestId), 'Unable to load setup timeline')
	};
}
