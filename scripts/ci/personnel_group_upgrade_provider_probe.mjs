import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { createServer } from 'vite';

// Read only the synthetic populated-upgrade rows after their SQL contracts.
const url = process.env.T2T_PROBE_API_URL;
const serviceKey = process.env.T2T_PROBE_SERVICE_KEY;
assert.ok(url && serviceKey, 'Disposable provider coordinates are required');
assert.equal(new URL(url).hostname, '127.0.0.1', 'Only an isolated loopback provider is allowed');
const service = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const id = (suffix) => `d1200000-0000-4000-8000-${String(suffix).padStart(12, '0')}`;
const expected = [
	{ id: id(301), groupId: id(201), groupName: 'Retained Alpha Group', slug: 'personnel-upgrade-same' },
	{ id: id(302), groupId: id(202), groupName: 'Disposable Alpha Group', slug: 'personnel-upgrade-archived' },
	{ id: id(303), groupId: id(202), groupName: 'Disposable Alpha Group', slug: 'personnel-upgrade-active' },
	{ id: id(304), groupId: id(203), groupName: '', slug: 'personnel-upgrade-legacy' },
	{ id: id(306), groupId: null, groupName: '', slug: 'personnel-upgrade-unassigned' }
];

const root = fileURLToPath(new URL('../../', import.meta.url));
const previousCwd = process.cwd();
process.chdir(root);
const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
	const { PersonnelEntity } = await vite.ssrLoadModule('/src/lib/server/entities/personnel.ts');
	const { createSupabaseSignInRosterPersonnelLookupPort } = await vite.ssrLoadModule(
		'/src/features/personnel/signInRosterPersonnelLookup.server.ts'
	);
	// The already-deployed preparation remains usable between the manual
	// migration and this application's release, with both relationships present.
	const { data: preparedRows, error: preparedError } = await service
		.from('personnel')
		.select('id, group_id, slug, groups:groups!personnel_group_id_fkey(name)')
		.eq('organization_id', id(101))
		.order('id');
	if (preparedError) throw new Error(`Prepared-client read failed (${preparedError.code}): ${preparedError.message}`);
	assert.deepEqual(
		preparedRows.map((row) => ({
			id: row.id,
			groupId: row.group_id,
			groupName: row.groups?.name ?? '',
			slug: row.slug
		})),
		expected.map((row) => (row.id === id(304) ? { ...row, groupName: 'Foreign Bravo Group' } : row))
	);

	const { data, error } = await service
		.from('personnel')
		.select(PersonnelEntity.select)
		.eq('organization_id', id(101))
		.order('id');
	if (error) throw new Error(`Populated Personnel read failed (${error.code}): ${error.message}`);
	assert.deepEqual(
		PersonnelEntity.fromDbArray(data).map(({ id, groupId, groupName, slug }) => ({ id, groupId, groupName, slug })),
		expected
	);
	assert.equal(
		new Date(PersonnelEntity.fromDb(data.find((row) => row.id === id(302))).archivedAt).toISOString(),
		'2026-08-01T12:00:00.000Z'
	);
	assert.equal(data.find((row) => row.id === id(304)).groups, null);

	const snapshots = createSupabaseSignInRosterPersonnelLookupPort(() => service);
	const rows = await snapshots.findPersonnelForRosterSnapshot(id(101), [
		id(301),
		id(302),
		id(303),
		id(304),
		id(305),
		id(306)
	]);
	assert.deepEqual(
		rows.map(({ id, groupId, groupName }) => ({ id, groupId, groupName })).sort((a, b) => a.id.localeCompare(b.id)),
		expected.map(({ id, groupId, groupName }) => ({ id, groupId, groupName: groupName || null }))
	);
	const foreign = await snapshots.findPersonnelForRosterSnapshot(id(102), [id(304), id(305)]);
	assert.deepEqual(
		foreign.map(({ id, groupId, groupName }) => ({ id, groupId, groupName })),
		[{ id: id(305), groupId: id(203), groupName: 'Foreign Bravo Group' }]
	);
} finally {
	await vite.close();
	process.chdir(previousCwd);
}

console.log(
	'Prepared-client compatibility, retained Personnel IDs/references and foreign-label concealment passed through actual PostgREST reads.'
);
