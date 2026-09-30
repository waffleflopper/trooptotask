import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { getAdminClient } = vi.hoisted(() => ({ getAdminClient: vi.fn() }));

vi.mock('$lib/server/supabase', () => ({ getAdminClient }));

import { createRequestNotificationDelivery } from './httpAdapter';
const { notifyAdmins, notifyUser } = createRequestNotificationDelivery();


interface Membership {
	organization_id: string;
	user_id: string;
	role: 'owner' | 'admin' | 'member';
}

interface NotificationRow {
	organization_id: string;
	user_id: string;
	type: string;
	title: string;
	message: string;
	link: string | null;
}

/** A provider boundary with real filtering, pagination and observable inserted rows. */
function createProvider(memberships: Membership[] = []) {
	const state = {
		memberships,
		stored: [] as NotificationRow[],
		attempts: [] as NotificationRow[][],
		insertError: null as { message: string } | null
	};

	function membershipQuery() {
		const filters: ((membership: Membership) => boolean)[] = [];
		const query = {
			select() {
				return query;
			},
			eq(column: keyof Membership, value: string) {
				filters.push((membership) => membership[column] === value);
				return query;
			},
			in(column: keyof Membership, values: string[]) {
				filters.push((membership) => values.includes(membership[column]));
				return query;
			},
			async range(from: number, to: number) {
				return {
					data: state.memberships
						.filter((membership) => filters.every((filter) => filter(membership)))
						.slice(from, Math.min(to + 1, from + 1000)),
					error: null
				};
			}
		};
		return query;
	}

	const client = {
		from(table: string) {
			if (table === 'organization_memberships') return membershipQuery();
			if (table === 'notifications') {
				return {
					async insert(input: NotificationRow | NotificationRow[]) {
						const rows = (Array.isArray(input) ? input : [input]).map((row) => ({ ...row }));
						state.attempts.push(rows);
						if (!state.insertError) state.stored.push(...rows);
						return { error: state.insertError };
					}
				};
			}
			throw new Error(`Unexpected provider table: ${table}`);
		}
	};

	getAdminClient.mockReturnValue(client);
	return state;
}

const payload = {
	type: 'deletion_request',
	title: 'Review requested',
	message: 'A record is awaiting review',
	link: '/org-a/deletion-requests'
};

describe('notification producers', () => {
	beforeEach(() => getAdminClient.mockReset());
	afterEach(() => vi.restoreAllMocks());

	it('stores the complete payload for only the specified user and Organization', async () => {
		const provider = createProvider([
			{ organization_id: 'org-a', user_id: 'recipient', role: 'member' },
			{ organization_id: 'org-a', user_id: 'other-admin', role: 'admin' },
			{ organization_id: 'org-b', user_id: 'foreign-owner', role: 'owner' }
		]);

		await notifyUser('org-a', 'recipient', payload);

		expect(provider.stored).toEqual([
			{
				organization_id: 'org-a',
				user_id: 'recipient',
				type: 'deletion_request',
				title: 'Review requested',
				message: 'A record is awaiting review',
				link: '/org-a/deletion-requests'
			}
		]);
	});

	it('reaches owners/admins beyond the provider page without notifying the actor, members or another Organization', async () => {
		const adminIds = Array.from({ length: 1000 }, (_, index) => `admin-${index}`);
		const provider = createProvider([
			{ organization_id: 'org-a', user_id: 'actor', role: 'admin' },
			...adminIds.map((user_id) => ({ organization_id: 'org-a', user_id, role: 'admin' as const })),
			{ organization_id: 'org-a', user_id: 'last-page-owner', role: 'owner' },
			{ organization_id: 'org-a', user_id: 'ordinary-member', role: 'member' },
			{ organization_id: 'org-b', user_id: 'foreign-owner', role: 'owner' },
			{ organization_id: 'org-b', user_id: 'foreign-admin', role: 'admin' }
		]);

		await notifyAdmins('org-a', 'actor', { type: 'review', title: 'Review', message: 'Pending review' });

		expect(provider.stored).toHaveLength(1001);
		expect(provider.stored).toEqual(
			expect.arrayContaining(
				[...adminIds, 'last-page-owner'].map((user_id) => ({
					organization_id: 'org-a',
					user_id,
					type: 'review',
					title: 'Review',
					message: 'Pending review',
					link: null
				}))
			)
		);
	});

	it('resolves current Organization membership on each send, including sends with no actor exclusion', async () => {
		const provider = createProvider([
			{ organization_id: 'org-a', user_id: 'previous-admin', role: 'admin' },
			{ organization_id: 'org-a', user_id: 'new-owner', role: 'member' }
		]);

		await notifyAdmins('org-a', null, payload);
		provider.memberships[0].role = 'member';
		provider.memberships[1].role = 'owner';
		await notifyAdmins('org-a', null, payload);

		expect(provider.stored.map((row) => row.user_id)).toEqual(['previous-admin', 'new-owner']);
	});

	it.each([
		{ name: 'has no owners/admins', includeActor: false },
		{ name: 'has only the excluded actor', includeActor: true }
	])('does not insert or broadcast when the Organization $name', async ({ includeActor }) => {
		const memberships: Membership[] = [
			{ organization_id: 'org-a', user_id: 'ordinary-member', role: 'member' },
			{ organization_id: 'org-b', user_id: 'foreign-admin', role: 'admin' }
		];
		if (includeActor) memberships.push({ organization_id: 'org-a', user_id: 'actor', role: 'owner' });
		const provider = createProvider(memberships);

		await notifyAdmins('org-a', 'actor', payload);

		expect(provider.stored).toEqual([]);
		expect(provider.attempts).toEqual([]);
	});

	it.each(['user', 'admins'] as const)(
		'logs a failed %s insert without claiming delivery, and permits a later explicit attempt',
		async (audience) => {
			const provider = createProvider([{ organization_id: 'org-a', user_id: 'recipient', role: 'owner' }]);
			const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
			provider.insertError = { message: 'provider unavailable' };
			const send = () =>
				audience === 'user' ? notifyUser('org-a', 'recipient', payload) : notifyAdmins('org-a', null, payload);

			await expect(send()).resolves.toBeUndefined();

			expect(provider.stored).toEqual([]);
			expect(provider.attempts).toHaveLength(1);
			expect(logged).toHaveBeenCalledWith(expect.any(String), 'provider unavailable');

			// There is no automatic retry or delivery guarantee: a caller initiates this second attempt.
			provider.insertError = null;
			await send();

			expect(provider.stored).toEqual([
				{
					organization_id: 'org-a',
					user_id: 'recipient',
					type: 'deletion_request',
					title: 'Review requested',
					message: 'A record is awaiting review',
					link: '/org-a/deletion-requests'
				}
			]);
		}
	);
});
