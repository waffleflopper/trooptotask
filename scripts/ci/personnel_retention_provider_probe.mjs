import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import { parse } from 'smol-toml';
import { createClient } from '@supabase/supabase-js';
import { selectAllSupabaseRows } from '../../src/lib/server/supabasePagination.server.ts';

const url = process.env.T2T_PROBE_API_URL;
const serviceKey = process.env.T2T_PROBE_SERVICE_KEY;
const anonKey = process.env.T2T_PROBE_ANON_KEY;
assert.ok(url && serviceKey && anonKey, 'Disposable provider coordinates are required');
const config = parse(await fs.readFile('supabase/config.toml', 'utf8'));
const endpoint = new URL(url);
assert.equal(endpoint.protocol, 'http:');
assert.equal(endpoint.hostname, '127.0.0.1');
assert.equal(Number(endpoint.port), config.api.port);
assert.ok(config.api.port >= 58000 && config.api.port < 65000);
assert.match(config.project_id, /^t2t-ci-db-[a-zA-Z0-9_-]+$/);
assert.deepEqual(config.db.seed, { enabled: false, sql_paths: [] });
const rpcRequests = [];
const options = {
	auth: { persistSession: false, autoRefreshToken: false },
	global: {
		fetch: async (input, init) => {
			const address = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
			const response = await fetch(input, init);
			if (address.pathname === '/rest/v1/rpc/delete_expired_personnel') {
				rpcRequests.push({
					method: init?.method ?? 'GET',
					urlBytes: Buffer.byteLength(address.href),
					bodyBytes: typeof init?.body === 'string' ? Buffer.byteLength(init.body) : null,
					status: response.status
				});
			}
			return response;
		}
	}
};
const service = createClient(url, serviceKey, options);
const anonymous = createClient(url, anonKey, options);
const checked = (result) => {
	if (result.error)
		throw new Error(`Disposable retention probe failed (${result.error.code}): ${result.error.message}`);
	return result.data;
};
const id = (suffix) => `e1362000-0000-4000-8000-${String(suffix).padStart(12, '0')}`;
const cutoff = '2025-05-30T12:00:00Z';
const args = { p_org_id: id(101), p_candidate_ids: [], p_cutoff: cutoff };
const observations = {
	project: config.project_id,
	apiPort: config.api.port,
	boundary: 'Actual PostgREST RPC, SQL cascades and commit errors; no Storage-byte or UI claim',
	grants: [],
	rpcRequests
};

async function allRows(table, organizationId) {
	return checked(
		await selectAllSupabaseRows((from, to) =>
			service.from(table).select('*').eq('organization_id', organizationId).order('id').range(from, to)
		)
	);
}

const email = `retention-probe-${randomUUID()}@example.test`;
const password = randomUUID() + 'A9!';
const user = checked(await service.auth.admin.createUser({ email, password, email_confirm: true })).user;
const member = createClient(url, anonKey, options);
checked(await member.auth.signInWithPassword({ email, password }));
for (const [role, client] of [
	['anon', anonymous],
	['authenticated', member]
]) {
	const result = await client.rpc('delete_expired_personnel', args);
	observations.grants.push({ role, status: result.status, code: result.error?.code, data: result.data });
	assert.equal(result.error?.code, '42501');
	assert.equal(result.data, null);
}
for (const key of ['p_org_id', 'p_candidate_ids', 'p_cutoff']) {
	const result = await service.rpc('delete_expired_personnel', { ...args, [key]: null });
	observations.grants.push({
		role: 'service_role',
		invalidArgument: key,
		status: result.status,
		code: result.error?.code
	});
	assert.equal(result.error?.code, '22023');
}
assert.equal(checked(await service.rpc('delete_expired_personnel', args)), 0);
checked(
	await service.from('organizations').insert({ id: id(101), name: 'Personnel Retention Provider', created_by: user.id })
);
checked(
	await service
		.from('organizations')
		.insert({ id: id(102), name: 'Personnel Retention Provider Foreign', created_by: user.id })
);
const people = Array.from({ length: 1001 }, () => ({
	id: randomUUID(),
	organization_id: id(101),
	rank: 'SPC',
	first_name: 'Bulk',
	last_name: 'Retention',
	slug: 'retention-probe-' + randomUUID(),
	archived_at: '2020-01-01Z'
}));
const retained = [
	{
		id: id(301),
		organization_id: id(101),
		rank: 'SGT',
		first_name: 'Active',
		last_name: 'Retained',
		slug: 'retention-probe-active',
		archived_at: null
	},
	{
		id: id(302),
		organization_id: id(101),
		rank: 'SGT',
		first_name: 'Cutoff',
		last_name: 'Retained',
		slug: 'retention-probe-cutoff',
		archived_at: cutoff
	},
	{
		id: id(303),
		organization_id: id(101),
		rank: 'SGT',
		first_name: 'Recent',
		last_name: 'Retained',
		slug: 'retention-probe-recent',
		archived_at: '2026-01-01Z'
	},
	{
		id: id(304),
		organization_id: id(102),
		rank: 'SGT',
		first_name: 'Foreign',
		last_name: 'Retained',
		slug: 'retention-probe-foreign',
		archived_at: '2020-01-01Z'
	}
];
for (let offset = 0; offset < people.length; offset += 100)
	checked(await service.from('personnel').insert(people.slice(offset, offset + 100)));
checked(await service.from('personnel').insert(retained));
checked(
	await service
		.from('personnel_documents')
		.insert({
			id: id(401),
			organization_id: id(101),
			personnel_id: people[0].id,
			title: 'Active cascade document',
			file_path: 'synthetic/provider-retention.pdf',
			uploaded_by: 'fixture'
		})
);
checked(
	await service
		.from('counseling_records')
		.insert({
			id: id(402),
			organization_id: id(101),
			personnel_id: people[0].id,
			title: 'Recent cascade counseling',
			subject: 'Synthetic',
			date_conducted: '2026-01-01',
			file_path: 'synthetic/provider-retention-counseling.pdf',
			uploaded_by: 'fixture',
			archived_at: '2026-01-01Z'
		})
);
checked(
	await service
		.from('rating_scheme_entries')
		.insert({
			id: id(501),
			organization_id: id(101),
			rated_person_id: id(301),
			eval_type: 'NCOER',
			rater_person_id: people[0].id,
			senior_rater_person_id: people[0].id,
			intermediate_rater_person_id: people[0].id,
			reviewer_person_id: people[0].id,
			rater_name: 'Retained Rater',
			senior_rater_name: 'Retained Senior',
			intermediate_rater_name: 'Retained Intermediate',
			reviewer_name: 'Retained Reviewer',
			rating_period_start: '2026-01-01',
			rating_period_end: '2026-12-31',
			status: 'active',
			notes: 'Retained evaluation facts'
		})
);
const before = {
	personnel: await allRows('personnel', id(101)),
	foreign: await allRows('personnel', id(102)),
	documents: await allRows('personnel_documents', id(101)),
	counselings: await allRows('counseling_records', id(101)),
	evaluation: await allRows('rating_scheme_entries', id(101))
};
assert.equal(before.personnel.length, 1004);
const candidates = [
	...people.map((person) => person.id),
	people[0].id,
	...retained.map((person) => person.id),
	randomUUID()
];
const deleted = checked(await service.rpc('delete_expired_personnel', { ...args, p_candidate_ids: candidates }));
assert.equal(deleted, 1001);
const after = {
	personnel: await allRows('personnel', id(101)),
	foreign: await allRows('personnel', id(102)),
	documents: await allRows('personnel_documents', id(101)),
	counselings: await allRows('counseling_records', id(101)),
	evaluation: await allRows('rating_scheme_entries', id(101))
};
assert.deepEqual(
	after.personnel,
	before.personnel.filter((person) => retained.some((sentinel) => sentinel.id === person.id))
);
assert.deepEqual(after.foreign, before.foreign);
assert.deepEqual(after.documents, []);
assert.deepEqual(after.counselings, []);
const evaluatorFields = [
	'rater_person_id',
	'senior_rater_person_id',
	'intermediate_rater_person_id',
	'reviewer_person_id'
];
for (const field of evaluatorFields) assert.equal(after.evaluation[0][field], null);
const withoutEffects = (row) =>
	Object.fromEntries(Object.entries(row).filter(([key]) => !evaluatorFields.includes(key) && key !== 'updated_at'));
assert.deepEqual(withoutEffects(after.evaluation[0]), withoutEffects(before.evaluation[0]));
assert.ok(Date.parse(after.evaluation[0].updated_at) >= Date.parse(before.evaluation[0].updated_at));
assert.equal(checked(await service.rpc('delete_expired_personnel', { ...args, p_candidate_ids: candidates })), 0);
observations.bulk = {
	candidateIds: people.map((person) => person.id),
	independentlyPaginatedBeforeCount: before.personnel.length,
	rpcDeletedCount: deleted,
	after,
	evaluationBefore: before.evaluation
};

if (process.argv.includes('--staged-upgrade')) {
	const legacyId = (suffix) => `d1602000-0000-4000-8000-${String(suffix).padStart(12, '0')}`;
	const legacyTables = ['personnel', 'rating_scheme_entries', 'personnel_documents', 'counseling_records'];
	const snapshot = async () => {
		const rows = {};
		for (const table of legacyTables)
			rows[table] = [...(await allRows(table, legacyId(101))), ...(await allRows(table, legacyId(102)))].sort((a, b) =>
				a.id.localeCompare(b.id)
			);
		return rows;
	};
	const upgradeBefore = await snapshot();
	assert.equal(upgradeBefore.personnel.length + upgradeBefore.rating_scheme_entries.length, 13);
	for (const suffix of [302, 305])
		checked(await service.from('personnel').update({ archived_at: '2000-01-01Z' }).eq('id', legacyId(suffix)));
	const free = [
		{
			id: legacyId(391),
			organization_id: legacyId(102),
			rank: 'SGT',
			first_name: 'Free',
			last_name: 'Bravo',
			slug: 'retention-provider-free-bravo',
			archived_at: '2000-01-01Z'
		},
		{
			id: legacyId(392),
			organization_id: legacyId(101),
			rank: 'SGT',
			first_name: 'Free',
			last_name: 'Alpha',
			slug: 'retention-provider-free-alpha',
			archived_at: '2000-01-01Z'
		}
	];
	checked(await service.from('personnel').insert(free));
	checked(
		await service
			.from('personnel_documents')
			.insert(
				free.map((person) => ({
					id: randomUUID(),
					organization_id: person.organization_id,
					personnel_id: person.id,
					title: 'Retained free-person document',
					file_path: 'synthetic/' + person.id + '.pdf',
					uploaded_by: 'fixture'
				}))
			)
	);
	checked(
		await service
			.from('counseling_records')
			.insert(
				free.map((person) => ({
					id: randomUUID(),
					organization_id: person.organization_id,
					personnel_id: person.id,
					title: 'Retained free-person counseling',
					subject: 'Synthetic',
					date_conducted: '2026-01-01',
					file_path: 'synthetic/' + person.id + '-counseling.pdf',
					uploaded_by: 'fixture'
				}))
			)
	);
	const prepared = await snapshot();
	const attempts = [];
	for (const [org, freelyDeletable, blocked] of [
		[102, 391, 305],
		[101, 392, 302]
	]) {
		// Await the actual RPC response, including its transaction-end FK check.
		const result = await service.rpc('delete_expired_personnel', {
			p_org_id: legacyId(org),
			p_candidate_ids: [legacyId(freelyDeletable), legacyId(blocked)],
			p_cutoff: cutoff
		});
		const current = await snapshot();
		attempts.push({
			orgId: legacyId(org),
			candidates: [legacyId(freelyDeletable), legacyId(blocked)],
			status: result.status,
			error: result.error,
			data: result.data,
			after: current
		});
		assert.equal(result.error?.code, '23503');
		assert.equal(result.data, null);
		assert.deepEqual(current, prepared);
	}
	observations.legacy = {
		upgradeBefore,
		prepared,
		attempts,
		result:
			'Both actual commit/error boundaries preserve whole parent batches, children, all evaluator facts and timestamps'
	};
}
checked(await member.auth.signOut());
console.log(JSON.stringify(observations, null, 2));
console.log(
	'Personnel retention service-only calls, exact 1001 count, retained scope/cascades and applicable legacy atomic rollback passed through actual PostgREST.'
);
