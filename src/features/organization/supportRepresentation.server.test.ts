import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { createOrganizationSupportReader } from './supportReadProvider.server';

function reader(body: unknown, total = 0) {
	return createOrganizationSupportReader(
		createClient('http://localhost:9', 'synthetic-service-key', {
			auth: { persistSession: false, autoRefreshToken: false },
			global: { fetch: async () => Response.json(body, { headers: { 'content-range': `*/${total}` } }) }
		})
	);
}

const collectionReads = {
	ledger: (subject: ReturnType<typeof reader>) =>
		subject.listOrganizationsPage({ q: '', status: 'all', from: 0, to: 24 }),
	search: (subject: ReturnType<typeof reader>) => subject.searchOrganizationsByName({ query: 'able', maxResults: 5 }),
	candidates: (subject: ReturnType<typeof reader>) => subject.listLatestOrganizations({ limit: 100 }),
	userCounts: (subject: ReturnType<typeof reader>) => subject.listMembershipUserIds(['user']),
	userDetail: (subject: ReturnType<typeof reader>) => subject.listMembershipsForUser('user'),
	memberships: (subject: ReturnType<typeof reader>) => subject.countMembershipsByOrganization(['able']),
	leaders: (subject: ReturnType<typeof reader>) => subject.countLeaderMembershipsByOrganization(['able']),
	owners: (subject: ReturnType<typeof reader>) => subject.listOwnerMembershipMetricsByOrganization(['able'])
};

describe('Organization support required representations', () => {
	it.each(Object.entries(collectionReads))(
		'does not interpret a null %s collection as verified emptiness',
		async (_name, read) => {
			await expect(read(reader(null))).rejects.toThrow();
		}
	);

	it.each(Object.entries(collectionReads))('rejects a nonarray %s collection', async (_name, read) => {
		await expect(read(reader({ rows: [] }))).rejects.toThrow();
	});

	it.each([
		['missing User ID', 'userCounts', [{}]],
		['numeric User ID', 'userCounts', [{ user_id: 12 }]],
		['foreign User ID', 'userCounts', [{ user_id: 'outside' }]],
		['missing membership role', 'userDetail', [{ organizations: null }]],
		['malformed joined Organization', 'userDetail', [{ role: 'owner', organizations: { id: 'able', name: 12 } }]],
		['missing named Organization', 'search', [{ id: 'able' }]],
		['missing candidate timestamp', 'candidates', [{ id: 'able', name: 'Able' }]],
		['missing ledger suspension', 'ledger', [{ id: 'able', name: 'Able', created_at: '2026-10-01' }]],
		['foreign membership metric', 'memberships', [{ organization_id: 'outside', membership_count: 1 }]],
		['boolean membership count', 'memberships', [{ organization_id: 'able', membership_count: true }]],
		['missing leader scope', 'leaders', [{ id: 'leader' }]],
		['foreign leader scope', 'leaders', [{ id: 'leader', organization_id: 'outside' }]],
		['missing owner scope', 'owners', [{ owner_count: 2, owner_user_id: null, owner_email: null }]],
		[
			'malformed owner email',
			'owners',
			[{ organization_id: 'able', owner_count: 1, owner_user_id: 'owner', owner_email: 12 }]
		],
		[
			'invalid owner count',
			'owners',
			[{ organization_id: 'able', owner_count: true, owner_user_id: null, owner_email: null }]
		],
		[
			'contradictory multiple owners',
			'owners',
			[{ organization_id: 'able', owner_count: 2, owner_user_id: 'owner', owner_email: null }]
		]
	] as const)('rejects %s rather than presenting trusted support facts', async (_name, operation, body) => {
		await expect(collectionReads[operation](reader(body))).rejects.toThrow();
	});

	it('preserves legitimate empty collections, exact zero count, and absent detail', async () => {
		const subject = reader([]);
		const expected = {
			ledger: { organizations: [], totalCount: 0 },
			search: [],
			candidates: [],
			userCounts: [],
			userDetail: [],
			memberships: new Map(),
			leaders: new Map(),
			owners: []
		};
		for (const [name, read] of Object.entries(collectionReads))
			await expect(read(subject)).resolves.toEqual(expected[name as keyof typeof expected]);
		await expect(subject.countOrganizations()).resolves.toBe(0);
		await expect(reader(null).getOrganizationById('absent')).resolves.toBeNull();
	});

	it('rejects malformed detail instead of treating it as an Organization', async () => {
		await expect(reader({ id: 'able', name: 'Able' }).getOrganizationById('able')).rejects.toThrow();
	});

	it('rejects a malformed later membership page rather than publishing a partial User count', async () => {
		const subject = createOrganizationSupportReader(
			createClient('http://localhost:9', 'synthetic-service-key', {
				auth: { persistSession: false, autoRefreshToken: false },
				global: {
					fetch: async (input, init) => {
						const q = new URL(new Request(input, init).url).searchParams;
						return Response.json(
							Number(q.get('offset') ?? 0) === 0 ? Array.from({ length: 1000 }, () => ({ user_id: 'user' })) : null
						);
					}
				}
			})
		);
		await expect(subject.listMembershipUserIds(['user'])).rejects.toThrow();
	});

	it('preserves numeric and string aggregate zeros and multiple-owner null fields', async () => {
		await expect(
			reader([{ organization_id: 'able', membership_count: '0' }]).countMembershipsByOrganization(['able'])
		).resolves.toEqual(new Map([['able', 0]]));
		await expect(
			reader([
				{ organization_id: 'able', owner_count: '2', owner_user_id: null, owner_email: null }
			]).listOwnerMembershipMetricsByOrganization(['able'])
		).resolves.toEqual([{ organizationId: 'able', ownerCount: 2, singleOwner: null }]);
	});

	it('keeps aggregate keys aligned with a requested UUID when Postgres normalizes its case', async () => {
		const requested = 'A0B1C2D3-1234-4567-8910-123456789ABC';
		const returned = requested.toLowerCase();
		await expect(
			reader([{ organization_id: returned, membership_count: '3' }]).countMembershipsByOrganization([requested])
		).resolves.toEqual(new Map([[requested, 3]]));
		await expect(
			reader([
				{ organization_id: returned, owner_count: 1, owner_user_id: 'owner', owner_email: null }
			]).listOwnerMembershipMetricsByOrganization([requested])
		).resolves.toEqual([
			{
				organizationId: requested,
				ownerCount: 1,
				singleOwner: { organizationId: requested, userId: 'owner', email: null }
			}
		]);
	});

	it.each(['memberships', 'owners'] as const)('rejects ambiguous duplicate %s metrics', async (operation) => {
		const row =
			operation === 'memberships'
				? { organization_id: 'able', membership_count: 1 }
				: { organization_id: 'able', owner_count: 2, owner_user_id: null, owner_email: null };
		await expect(collectionReads[operation](reader([row, row]))).rejects.toThrow();
	});
});
