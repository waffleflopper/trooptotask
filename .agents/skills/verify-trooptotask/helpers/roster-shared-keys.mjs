import { createHash, randomUUID } from 'node:crypto';
import { jsPDF } from 'jspdf';
import {
	fixtureUploadActor,
	registeredFixtureFileWrite
} from '../../../../scripts/verification/registered-file-upload.mjs';

// One stored key per case. `owner` decides the key's path and which record owns it; `references` are the
// other records that point at the same key. Each release names who can perform it: `native` uses the
// visible roster controls, `ordinary` an authenticated app request (artifact-http), `fixture` this
// helper's bounded service-role release where the roster commands refuse an unowned pointer (22023).
export const SHARED_KEY_CASES = Object.freeze({
	ownerRelease: { owner: 'roster', references: ['counseling'], releases: ['native', 'ordinary'] },
	nonowningRoster: { owner: 'roster', references: ['roster'], releases: ['native', 'fixture'] },
	reverseCounseling: { owner: 'counseling', references: ['roster'], releases: ['ordinary', 'fixture'] },
	crossPersonDocument: { owner: 'document', references: ['document'], releases: ['ordinary', 'ordinary'] },
	foreignUnreleased: { owner: 'counseling', organization: 'orgB', references: [], releases: [] },
	openRegistration: { owner: 'roster-prefix', references: ['counseling'], releases: ['ordinary'], open: true }
});
const FIXTURE_RELEASES = Object.freeze(['nonowningRoster', 'reverseCounseling']);

const checked = (result) => {
	if (result.error) throw new Error('Owned shared-key provider operation failed: ' + result.error.message);
	return result.data;
};

function pdf(text) {
	const document = new jsPDF();
	document.text(text, 10, 20);
	return Buffer.from(document.output('arraybuffer'));
}

/** Builds every row, key and byte before any effect, so the manifest can be journaled first. */
export function sharedKeyManifest({ fixture, tag, archivedAt }) {
	const { ids, actors } = fixture;
	const person = (organization, label) => ({
		id: randomUUID(),
		organization_id: ids[organization],
		group_id: ids[organization === 'orgA' ? 'groupA' : 'groupForeign'],
		rank: 'SPC',
		first_name: 'Synthetic',
		last_name: `SharedKey${label}${tag}`,
		slug: `shared-key-${label.toLowerCase()}-${tag}`,
		archived_at: null
	});
	const people = {
		owner: person('orgA', 'Owner'),
		reference: person('orgA', 'Reference'),
		foreign: person('orgB', 'Foreign')
	};
	const rows = {
		personnel: Object.values(people),
		sign_in_rosters: [],
		counseling_records: [],
		personnel_documents: []
	};
	const roles = {};
	const files = [];
	const cases = {};
	const roster = (caseName, role, signedFilePath, id = randomUUID()) => {
		const row = {
			id,
			organization_id: ids.orgA,
			title: `Shared key ${caseName} ${role} ${tag}`,
			roster_date: null,
			blank_date: true,
			personnel_snapshot: [
				{ id: ids.personA, rank: 'SPC', lastName: 'Able', firstName: 'Synthetic', group: 'Alpha', groupId: ids.groupA }
			],
			personnel_ids: [ids.personA],
			scope_group_ids: [ids.groupA],
			filter_config: { verification: tag },
			signed_file_path: signedFilePath,
			created_by: actors.rosterManager.id
		};
		rows.sign_in_rosters.push(row);
		return row;
	};
	const artifact = (table, caseName, role, parent, filePath, archived) => {
		const foreign = parent.organization_id === ids.orgB;
		const title = `Shared key ${caseName} ${role} ${tag}`;
		const row = {
			id: randomUUID(),
			organization_id: parent.organization_id,
			personnel_id: parent.id,
			title,
			file_path: filePath,
			uploaded_by: actors[foreign ? 'personnelForeign' : 'manager'].id,
			archived_at: archived ? archivedAt : null
		};
		if (table === 'personnel_documents') Object.assign(row, { file_size_bytes: 1, content_type: 'application/pdf' });
		else
			Object.assign(row, {
				date_conducted: archivedAt.slice(0, 10),
				subject: title,
				summary: 'Synthetic shared-key witness ' + tag,
				status: 'completed'
			});
		rows[table].push(row);
		return row;
	};
	for (const [caseName, spec] of Object.entries(SHARED_KEY_CASES)) {
		const organization = spec.organization ?? 'orgA';
		const owner = organization === 'orgA' ? people.owner : people.foreign;
		const id = randomUUID();
		let key;
		let ownerRow;
		if (spec.owner === 'roster' || spec.owner === 'roster-prefix') {
			const rosterId = randomUUID();
			key = `${ids.orgA}/sign-in-rosters/${rosterId}/${id}-${caseName}.pdf`;
			ownerRow = roster(caseName, 'owner', spec.owner === 'roster' ? key : null, rosterId);
		} else if (spec.owner === 'counseling') {
			key = `${ids[organization]}/counseling-records/${owner.id}/${id}-${caseName}.pdf`;
			ownerRow = artifact('counseling_records', caseName, 'owner', owner, key, spec.releases[0] === 'ordinary');
		} else {
			key = `${ids.orgA}/personnel/${owner.id}/documents/${id}-${caseName}.pdf`;
			ownerRow = artifact('personnel_documents', caseName, 'owner', owner, key, true);
		}
		const bucket = spec.owner === 'document' ? 'personnel-documents' : 'counseling-files';
		const references = spec.references.map((kind) =>
			kind === 'roster'
				? roster(caseName, 'reference', key)
				: artifact(
						kind === 'document' ? 'personnel_documents' : 'counseling_records',
						caseName,
						'reference',
						people.reference,
						key,
						true
					)
		);
		const bytes = pdf(`Synthetic shared key ${caseName} ${tag}`);
		files.push({
			case: caseName,
			bucket,
			path: key,
			uploadId: randomUUID(),
			organizationId: ids[organization],
			actorId: fixtureUploadActor(fixture, organization).id,
			open: !!spec.open,
			size: bytes.length,
			sha256: createHash('sha256').update(bytes).digest('hex'),
			bytes
		});
		const table = (row) => Object.keys(rows).find((name) => rows[name].includes(row));
		roles[ownerRow.id] = 'owner';
		for (const row of references) roles[row.id] = 'reference';
		cases[caseName] = {
			organization,
			bucket,
			key,
			open: !!spec.open,
			releases: spec.releases,
			owner: {
				table: table(ownerRow),
				id: ownerRow.id,
				personnelId: ownerRow.personnel_id ?? null,
				title: ownerRow.title
			},
			references: references.map((row) => ({
				table: table(row),
				id: row.id,
				personnelId: row.personnel_id ?? null,
				title: row.title
			}))
		};
	}
	return { tag, archivedAt, people, rows, roles, files, cases, reuseProbes: [] };
}

const journal = ({ bytes: _bytes, ...file }) => file;

export async function seedRosterSharedKeys({ client, fixture, tag, ownedState, save, now = new Date() }) {
	if (ownedState.rosterSharedKeys) throw new Error('Clean the existing roster-shared-keys seed first.');
	const manifest = sharedKeyManifest({ fixture, tag, archivedAt: new Date(now.getTime() - 86_400_000).toISOString() });
	ownedState.rosterSharedKeys = { ...manifest, files: manifest.files.map(journal) };
	await save(ownedState);
	checked(await client.from('personnel').insert(manifest.rows.personnel));
	for (const file of manifest.files) await registeredFixtureFileWrite(client, fixture, file);
	for (const table of ['sign_in_rosters', 'counseling_records', 'personnel_documents'])
		checked(await client.from(table).insert(manifest.rows[table]));
	return {
		kind: 'roster-shared-keys',
		tag,
		archivedAt: manifest.archivedAt,
		people: Object.fromEntries(Object.entries(manifest.people).map(([role, row]) => [role, row.id])),
		cases: manifest.cases,
		files: manifest.files.map(journal),
		boundary:
			'Privileged synthetic setup in the owned provider: service-role rows, registered Storage writes. The cross-references cannot come from the UI.'
	};
}

const recorded = (ownedState) => {
	const manifest = ownedState.rosterSharedKeys;
	if (!manifest) throw new Error('Seed roster-shared-keys first.');
	return manifest;
};

/** Clears one recorded reference roster pointer that no member command may change. */
export async function releaseSharedKey({ client, fixture, ownedState, caseName }) {
	const manifest = recorded(ownedState);
	if (!FIXTURE_RELEASES.includes(caseName))
		throw new Error(`Use roster-shared-keys release ${FIXTURE_RELEASES.join('|')}.`);
	const { key, references } = manifest.cases[caseName];
	const [reference] = references;
	const updated = checked(
		await client
			.from('sign_in_rosters')
			.update({ signed_file_path: null })
			.eq('organization_id', fixture.ids.orgA)
			.eq('id', reference.id)
			.eq('signed_file_path', key)
			.select('id,signed_file_path')
	);
	const after = checked(
		await client
			.from('sign_in_rosters')
			.select('id,signed_file_path')
			.eq('organization_id', fixture.ids.orgA)
			.eq('id', reference.id)
	);
	return {
		case: caseName,
		key,
		rosterId: reference.id,
		released: updated.length === 1,
		alreadyReleased: updated.length === 0 && after[0]?.signed_file_path === null,
		after: after[0] ?? null,
		boundary:
			'Bounded fixture release with the service role. Roster Remove and Delete refuse a pointer outside the roster prefix (22023), so no member can clear it.'
	};
}

/** Asks the registration fence every app upload passes to admit the recorded key again; expects 23514. */
export async function probeSharedKeyReuse({ client, fixture, ownedState, save, caseName }) {
	const manifest = recorded(ownedState);
	const target = manifest.cases[caseName];
	if (!target) throw new Error(`Use roster-shared-keys reuse ${Object.keys(SHARED_KEY_CASES).join('|')}.`);
	const organizationId = fixture.ids[target.organization];
	const actorId = fixtureUploadActor(fixture, target.organization)?.id;
	if (!actorId) throw new Error('Owned fixture upload actor is missing.');
	const probe = {
		case: caseName,
		uploadId: randomUUID(),
		bucket: target.bucket,
		path: target.key,
		organizationId,
		actorId
	};
	manifest.reuseProbes.push(probe);
	await save(ownedState);
	const result = await client.rpc('register_organization_file_upload', {
		p_upload_id: probe.uploadId,
		p_organization_id: organizationId,
		p_actor_id: actorId,
		p_bucket_id: target.bucket,
		p_object_name: target.key
	});
	let settled = null;
	if (!result.error) settled = checked(await client.rpc('settle_organization_file_upload', settleArgs(probe)));
	return {
		case: caseName,
		key: target.key,
		refused: !!result.error,
		error: result.error ? { code: result.error.code, message: result.error.message } : null,
		unexpectedRegistrationSettled: settled,
		boundary: 'Service-role call to the registration fence the app runs before every upload; not a native upload.'
	};
}

const settleArgs = (file) => ({
	p_upload_id: file.uploadId,
	p_organization_id: file.organizationId,
	p_actor_id: file.actorId,
	p_bucket_id: file.bucket,
	p_object_name: file.path
});

/** Reference rows go first, so deleting an owner retires its key instead of leaving a hold. */
export async function cleanRosterSharedKeys({ client, fixture, ownedState, save }) {
	const manifest = ownedState.rosterSharedKeys;
	if (!manifest) return null;
	for (const registration of [...manifest.files.filter((file) => file.open), ...manifest.reuseProbes])
		checked(await client.rpc('settle_organization_file_upload', settleArgs(registration)));
	for (const role of ['reference', 'owner'])
		for (const table of ['personnel_documents', 'counseling_records', 'sign_in_rosters']) {
			const rows = manifest.rows[table].filter((row) => manifest.roles[row.id] === role);
			for (const organization of ['orgA', 'orgB']) {
				const ids = rows.filter((row) => row.organization_id === fixture.ids[organization]).map((row) => row.id);
				if (ids.length)
					checked(await client.from(table).delete().eq('organization_id', fixture.ids[organization]).in('id', ids));
			}
		}
	for (const organization of ['orgA', 'orgB']) {
		const ids = manifest.rows.personnel
			.filter((row) => row.organization_id === fixture.ids[organization])
			.map((row) => row.id);
		checked(await client.from('personnel').delete().eq('organization_id', fixture.ids[organization]).in('id', ids));
	}
	const removed = {};
	for (const bucket of ['counseling-files', 'personnel-documents']) {
		const paths = manifest.files.filter((file) => file.bucket === bucket).map((file) => file.path);
		checked(await client.storage.from(bucket).remove(paths));
		removed[bucket] = checked(
			await client.rpc('complete_organization_file_retirements', { p_bucket_id: bucket, p_object_names: paths })
		);
	}
	delete ownedState.rosterSharedKeys;
	await save(ownedState);
	return { tag: manifest.tag, retirementsCompleted: removed };
}
