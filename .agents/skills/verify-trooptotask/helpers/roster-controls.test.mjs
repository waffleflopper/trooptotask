import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cleanRosterInserts, insertRosterWithId, recordedRosterInsertTarget } from './roster-insert.mjs';
import {
	cleanRosterSharedKeys,
	probeSharedKeyReuse,
	releaseSharedKey,
	seedRosterSharedKeys
} from './roster-shared-keys.mjs';

const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const actor = (n) => ({ id: id(n), email: `actor${n}@example.test`, password: `private-password-${n}` });
const fixture = {
	ids: { orgA: id(1), orgB: id(2), groupA: id(3), groupForeign: id(4), personA: id(5), personForeign: id(6) },
	actors: {
		rosterManager: actor(10),
		rosterViewer: actor(11),
		rosterScoped: actor(12),
		rosterForeign: actor(13),
		manager: actor(14),
		personnelForeign: actor(15),
		orgOwner: actor(16),
		orgSettingsPeer: actor(17)
	}
};

/** Tables, RPCs and Storage in memory; every call is logged in order. */
function provider({ tables = {}, failUploadAt = Infinity, insertError = null, rpc = {} } = {}) {
	const log = [];
	const data = { personnel: [], sign_in_rosters: [], counseling_records: [], personnel_documents: [], ...tables };
	const objects = new Map();
	let uploads = 0;
	const from = (table) => {
		const filters = [];
		let op = 'select';
		let payload;
		const run = () => {
			const matches = (row) => filters.every((filter) => filter(row));
			log.push({
				table,
				op,
				ids: op === 'insert' ? payload.map((row) => row.id) : data[table].filter(matches).map((row) => row.id)
			});
			if (op === 'insert') {
				if (insertError)
					return { data: null, error: insertError.error, status: insertError.status, statusText: 'Forbidden' };
				data[table].push(...payload.map((row) => ({ ...row })));
				return { data: payload, error: null, status: 201, statusText: 'Created' };
			}
			const rows = data[table].filter(matches);
			if (op === 'delete') data[table] = data[table].filter((row) => !matches(row));
			if (op === 'update') for (const row of rows) Object.assign(row, payload);
			return { data: rows.map((row) => ({ ...row })), error: null, status: 200 };
		};
		const query = {
			select: () => query,
			insert: (rows) => ((op = 'insert'), (payload = [].concat(rows)), query),
			update: (values) => ((op = 'update'), (payload = values), query),
			delete: () => ((op = 'delete'), query),
			eq: (key, value) => (filters.push((row) => row[key] === value), query),
			in: (key, values) => (filters.push((row) => values.includes(row[key])), query),
			then: (resolve, reject) => Promise.resolve(run()).then(resolve, reject)
		};
		return query;
	};
	return {
		log,
		data,
		objects,
		from,
		async rpc(name, args) {
			log.push({ rpc: name, args });
			if (rpc[name]) return rpc[name](args);
			if (name === 'complete_organization_file_retirements') return { data: 0, error: null };
			return { data: name === 'register_organization_file_upload' ? args.p_upload_id : true, error: null };
		},
		storage: {
			from: (bucket) => ({
				async upload(path, bytes) {
					log.push({ upload: path });
					if (++uploads >= failUploadAt) return { data: null, error: { message: 'synthetic upload failure' } };
					objects.set(`${bucket}/${path}`, bytes);
					return { data: { path, fullPath: `${bucket}/${path}` }, error: null };
				},
				async remove(paths) {
					log.push({ remove: bucket, paths });
					for (const path of paths) objects.delete(`${bucket}/${path}`);
					return { data: [], error: null };
				}
			})
		}
	};
}

function journal() {
	const saves = [];
	return { saves, save: async (state) => saves.push(structuredClone(state)) };
}

test('an explicit-id insert journals its target first, signs in normally and records the replaced id for cleanup', async () => {
	const service = provider();
	const ownedState = { seeded: [] };
	const { saves, save } = journal();
	const sessions = [];
	const signIn = async (who) => {
		assert.equal(saves.length, 1, 'the cleanup target is saved before the ordinary session exists');
		assert.deepEqual(
			{ kind: saves[0].seeded[0].kind, requestedId: saves[0].seeded[0].requestedId, ids: saves[0].seeded[0].ids },
			{ kind: 'roster-insert', requestedId: id(90), ids: [] }
		);
		const client = provider();
		client.from = (table) => {
			const query = service.from(table);
			const insert = query.insert;
			query.insert = (row) => insert({ ...row, id: id(91) });
			return query;
		};
		client.auth = { signOut: async (options) => sessions.push({ actor: who.id, ...options }) };
		return client;
	};
	const result = await insertRosterWithId({
		service,
		signIn,
		fixture,
		args: ['rosterManager', 'orgA', id(90)],
		tag: 'tag1',
		ownedState,
		save
	});
	assert.deepEqual(
		{
			requestedId: result.requestedId,
			actualId: result.actualId,
			idReplaced: result.idReplaced,
			status: result.status,
			requestedRowBefore: result.requestedRowBefore,
			requestedRowAfter: result.requestedRowAfter,
			journaled: result.journaled
		},
		{
			requestedId: id(90),
			actualId: id(91),
			idReplaced: true,
			status: 201,
			requestedRowBefore: null,
			requestedRowAfter: null,
			journaled: { tag: 'tag1', ids: [id(91)] }
		}
	);
	assert.deepEqual(service.data.sign_in_rosters[0].personnel_ids, [id(5)]);
	assert.deepEqual(sessions, [{ actor: id(10), scope: 'local' }]);
	assert.equal(JSON.stringify(result).includes('private-password'), false);
	assert.equal(recordedRosterInsertTarget(ownedState, 'orgA', id(90)), true);
	assert.equal(recordedRosterInsertTarget(ownedState, 'orgA', id(91)), true);
	assert.equal(recordedRosterInsertTarget(ownedState, 'orgB', id(90)), false);

	await cleanRosterInserts({ service, fixture, ownedState, save });
	assert.deepEqual(service.data.sign_in_rosters, []);
	assert.deepEqual(ownedState.seeded, []);
	await cleanRosterInserts({ service, fixture, ownedState, save });
	assert.equal(recordedRosterInsertTarget(ownedState, 'orgA', id(90)), false);
});

test('a denied insert reports its status, records nothing to delete and still revokes the session', async () => {
	const service = provider({
		insertError: { status: 403, error: { code: '42501', message: 'new row violates row-level security policy' } }
	});
	const ownedState = { seeded: [] };
	const sessions = [];
	const result = await insertRosterWithId({
		service,
		signIn: async () => Object.assign(service, { auth: { signOut: async (options) => sessions.push(options) } }),
		fixture,
		args: ['rosterViewer', 'orgA', id(90)],
		tag: 'tag2',
		ownedState,
		save: async () => {}
	});
	assert.deepEqual(
		{ status: result.status, code: result.error.code, actualId: result.actualId, ids: ownedState.seeded[0].ids },
		{ status: 403, code: '42501', actualId: null, ids: [] }
	);
	assert.deepEqual(sessions, [{ scope: 'local' }]);
});

test('a lost insert reply is adopted for cleanup through its unique title', async () => {
	const service = provider();
	const ownedState = { seeded: [] };
	const result = await insertRosterWithId({
		service,
		signIn: async () => ({
			from: (table) => {
				const query = service.from(table);
				query.insert = (row) => {
					service.data[table].push({ ...row, id: id(92) });
					return { select: async () => ({ data: null, error: { code: '', message: 'fetch failed' }, status: 0 }) };
				};
				return query;
			},
			auth: { signOut: async () => {} }
		}),
		fixture,
		args: ['rosterManager', 'orgA', id(90)],
		tag: 'tag3',
		ownedState,
		save: async () => {}
	});
	assert.deepEqual([result.actualId, result.journaled.ids], [null, [id(92)]]);
});

test('roster-insert refuses foreign targets and malformed input before any journal or session', async () => {
	const service = provider({ tables: { sign_in_rosters: [{ id: id(93), organization_id: id(2) }] } });
	const ownedState = { seeded: [] };
	const signIn = async () => assert.fail('no session may open for a refused target');
	for (const args of [
		['rosterManager', 'orgA', id(93)],
		['manager', 'orgA', id(90)],
		['rosterManager', 'production', id(90)],
		['rosterManager', 'orgA', 'AAAAAAAA-0000-4000-8000-000000000090'],
		['rosterManager', 'orgA', "x';drop table sign_in_rosters;--"]
	])
		await assert.rejects(
			insertRosterWithId({ service, signIn, fixture, args, tag: 't', ownedState, save: async () => {} }),
			/Organization|Use roster-insert/
		);
	assert.deepEqual(ownedState.seeded, []);
});

const now = new Date('2026-10-14T12:00:00.000Z');

test('the shared-key seed journals every row, key and registration before its first effect', async () => {
	const client = provider();
	const ownedState = { seeded: [] };
	const { saves, save } = journal();
	const first = client.from;
	client.from = (table) => {
		assert.ok(saves.length >= 1, 'the manifest precedes every row write');
		return first(table);
	};
	const seeded = await seedRosterSharedKeys({ client, fixture, tag: 'k1', ownedState, save, now });
	const manifest = saves[0].rosterSharedKeys;
	assert.deepEqual(
		manifest.files.map((file) => [file.case, file.bucket, file.open]),
		[
			['ownerRelease', 'counseling-files', false],
			['nonowningRoster', 'counseling-files', false],
			['reverseCounseling', 'counseling-files', false],
			['crossPersonDocument', 'personnel-documents', false],
			['foreignUnreleased', 'counseling-files', false],
			['openRegistration', 'counseling-files', true]
		]
	);
	assert.equal(JSON.stringify(manifest).includes('"bytes"'), false);
	const { cases } = seeded;
	const roster = (rowId) => client.data.sign_in_rosters.find((row) => row.id === rowId);
	const counseling = (rowId) => client.data.counseling_records.find((row) => row.id === rowId);
	const document = (rowId) => client.data.personnel_documents.find((row) => row.id === rowId);

	assert.equal(roster(cases.ownerRelease.owner.id).signed_file_path, cases.ownerRelease.key);
	assert.ok(cases.ownerRelease.key.startsWith(`${id(1)}/sign-in-rosters/${cases.ownerRelease.owner.id}/`));
	assert.deepEqual(
		[
			counseling(cases.ownerRelease.references[0].id).file_path,
			counseling(cases.ownerRelease.references[0].id).archived_at
		],
		[cases.ownerRelease.key, '2026-10-13T12:00:00.000Z']
	);
	assert.equal(roster(cases.nonowningRoster.references[0].id).signed_file_path, cases.nonowningRoster.key);
	assert.ok(cases.reverseCounseling.key.startsWith(`${id(1)}/counseling-records/${seeded.people.owner}/`));
	assert.equal(counseling(cases.reverseCounseling.owner.id).archived_at, '2026-10-13T12:00:00.000Z');
	assert.equal(roster(cases.reverseCounseling.references[0].id).signed_file_path, cases.reverseCounseling.key);
	assert.deepEqual(
		[
			document(cases.crossPersonDocument.owner.id).personnel_id,
			document(cases.crossPersonDocument.references[0].id).personnel_id
		],
		[seeded.people.owner, seeded.people.reference]
	);
	assert.equal(document(cases.crossPersonDocument.references[0].id).file_path, cases.crossPersonDocument.key);
	assert.deepEqual(
		[
			counseling(cases.foreignUnreleased.owner.id).organization_id,
			counseling(cases.foreignUnreleased.owner.id).archived_at,
			cases.foreignUnreleased.references
		],
		[id(2), null, []]
	);
	assert.equal(roster(cases.openRegistration.owner.id).signed_file_path, null);
	assert.equal(counseling(cases.openRegistration.references[0].id).file_path, cases.openRegistration.key);

	const settled = client.log
		.filter((entry) => entry.rpc === 'settle_organization_file_upload')
		.map((entry) => entry.args.p_object_name);
	assert.equal(settled.includes(cases.openRegistration.key), false);
	assert.equal(settled.length, 5);
	assert.equal(client.objects.size, 6);
	await assert.rejects(
		seedRosterSharedKeys({ client, fixture, tag: 'k2', ownedState, save, now }),
		/Clean the existing/
	);
});

test('cleanup after a partial seed removes every recorded dependency, references before owners, and converges', async () => {
	const client = provider({ failUploadAt: 4 });
	const ownedState = { seeded: [] };
	const { save } = journal();
	await assert.rejects(seedRosterSharedKeys({ client, fixture, tag: 'k3', ownedState, save, now }), /not acknowledged/);
	const manifest = ownedState.rosterSharedKeys;
	assert.deepEqual([client.data.personnel.length, client.data.sign_in_rosters.length, client.objects.size], [3, 0, 3]);
	client.log.length = 0;

	const cleaned = await cleanRosterSharedKeys({ client, fixture, ownedState, save });
	assert.deepEqual([client.data.personnel, client.objects.size, ownedState.rosterSharedKeys], [[], 0, undefined]);
	assert.deepEqual(
		client.log
			.filter((entry) => entry.rpc === 'settle_organization_file_upload')
			.map((entry) => entry.args.p_upload_id),
		[manifest.files.find((file) => file.open).uploadId]
	);
	const deletes = client.log.filter((entry) => entry.op === 'delete').map((entry) => entry.table);
	assert.deepEqual(deletes.slice(0, 3), ['personnel_documents', 'counseling_records', 'sign_in_rosters']);
	assert.equal(deletes.at(-1), 'personnel');
	assert.deepEqual(
		client.log
			.filter((entry) => entry.rpc === 'complete_organization_file_retirements')
			.map((entry) => entry.args.p_bucket_id),
		['counseling-files', 'personnel-documents']
	);
	assert.deepEqual(cleaned.tag, 'k3');
	assert.equal(await cleanRosterSharedKeys({ client, fixture, ownedState, save }), null);
});

test('a reference row is deleted before its owner, so the owner deletion is the final release', async () => {
	const client = provider();
	const ownedState = { seeded: [] };
	const { save } = journal();
	const { cases } = await seedRosterSharedKeys({ client, fixture, tag: 'k4', ownedState, save, now });
	client.log.length = 0;
	await cleanRosterSharedKeys({ client, fixture, ownedState, save });
	const order = client.log.filter((entry) => entry.op === 'delete').flatMap((entry) => entry.ids);
	for (const { owner, references } of Object.values(cases))
		for (const reference of references) assert.ok(order.indexOf(reference.id) < order.indexOf(owner.id));
	assert.deepEqual(
		[client.data.sign_in_rosters, client.data.counseling_records, client.data.personnel_documents, client.objects.size],
		[[], [], [], 0]
	);
});

test('a fixture release clears only the recorded reference roster still holding the recorded key', async () => {
	const client = provider();
	const ownedState = { seeded: [] };
	const { save } = journal();
	const { cases } = await seedRosterSharedKeys({ client, fixture, tag: 'k5', ownedState, save, now });
	const first = await releaseSharedKey({ client, fixture, ownedState, caseName: 'reverseCounseling' });
	assert.deepEqual(
		[first.released, first.alreadyReleased, first.after],
		[true, false, { ...client.data.sign_in_rosters.find((row) => row.id === cases.reverseCounseling.references[0].id) }]
	);
	assert.equal(first.after.signed_file_path, null);
	assert.equal(
		client.data.sign_in_rosters.find((row) => row.id === cases.nonowningRoster.references[0].id).signed_file_path,
		cases.nonowningRoster.key
	);
	const again = await releaseSharedKey({ client, fixture, ownedState, caseName: 'reverseCounseling' });
	assert.deepEqual([again.released, again.alreadyReleased], [false, true]);
	await assert.rejects(
		releaseSharedKey({ client, fixture, ownedState, caseName: 'ownerRelease' }),
		/nonowningRoster\|reverseCounseling/
	);
	await assert.rejects(
		releaseSharedKey({ client, fixture, ownedState: { seeded: [] }, caseName: 'reverseCounseling' }),
		/Seed roster-shared-keys/
	);
});

test('a reuse probe is journaled first, reports the fence refusal and settles an unexpected registration', async () => {
	for (const fenced of [true, false]) {
		const rpc = {};
		const client = provider({ rpc });
		const ownedState = { seeded: [] };
		const { saves, save } = journal();
		const { cases } = await seedRosterSharedKeys({ client, fixture, tag: 'k6', ownedState, save, now });
		if (fenced)
			rpc.register_organization_file_upload = () => ({
				data: null,
				error: { code: '23514', message: 'This stored file was deleted and cannot be reused' }
			});
		client.log.length = 0;
		const savesBefore = saves.length;
		const result = await probeSharedKeyReuse({ client, fixture, ownedState, save, caseName: 'ownerRelease' });
		assert.equal(saves[savesBefore].rosterSharedKeys.reuseProbes[0].path, cases.ownerRelease.key);
		assert.deepEqual(
			[result.refused, result.error?.code ?? null, result.unexpectedRegistrationSettled],
			fenced ? [true, '23514', null] : [false, null, true]
		);
		assert.deepEqual(
			client.log.map((entry) => entry.rpc),
			fenced
				? ['register_organization_file_upload']
				: ['register_organization_file_upload', 'settle_organization_file_upload']
		);
		client.log.length = 0;
		await cleanRosterSharedKeys({ client, fixture, ownedState, save });
		const settledIds = client.log
			.filter((entry) => entry.rpc === 'settle_organization_file_upload')
			.map((entry) => entry.args.p_upload_id);
		assert.ok(settledIds.includes(saves[savesBefore].rosterSharedKeys.reuseProbes[0].uploadId));
	}
});
