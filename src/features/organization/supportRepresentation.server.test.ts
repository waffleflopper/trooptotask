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
	search: (subject: ReturnType<typeof reader>) => subject.searchOrganizationsByName({ query: 'able', maxResults: 5 }),
	candidates: (subject: ReturnType<typeof reader>) => subject.listLatestOrganizations({ limit: 100 }),
	userCounts: (subject: ReturnType<typeof reader>) => subject.listMembershipUserIds(['user']),
	userDetail: (subject: ReturnType<typeof reader>) => subject.listMembershipsForUser('user')
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
		['missing candidate timestamp', 'candidates', [{ id: 'able', name: 'Able' }]]
	] as const)('rejects %s rather than presenting trusted support facts', async (_name, operation, body) => {
		await expect(collectionReads[operation](reader(body))).rejects.toThrow();
	});

	it('preserves legitimate empty collections and absent detail', async () => {
		const subject = reader([]);
		const expected = {
			search: [],
			candidates: [],
			userCounts: [],
			userDetail: []
		};
		for (const [name, read] of Object.entries(collectionReads))
			await expect(read(subject)).resolves.toEqual(expected[name as keyof typeof expected]);
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
});
