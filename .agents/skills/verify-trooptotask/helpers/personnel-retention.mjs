import { registeredFixtureFileWrite } from '../../../../scripts/verification/registered-file-upload.mjs';
import { createHash, randomUUID } from 'node:crypto';
import { jsPDF } from 'jspdf';

const expiredAt = '2000-01-01T12:00:00.000Z';
const checked = (result) => {
	if (result.error) throw new Error('Owned retention provider operation failed: ' + result.error.message);
	return result.data;
};

// Temporary rows and object paths are recorded before any write, including interrupted setup.
export async function seedPersonnelRetention({ client, fixture, kind, tag, ownedState, save }) {
	const recentAt = new Date(Date.now() - 86400000).toISOString();
	const count = kind === 'personnel-retention-1001' ? 1001 : 2;
	const people = Array.from({ length: count }, (_, index) => ({
		id: randomUUID(),
		organization_id: fixture.ids.orgA,
		group_id: fixture.ids.groupA,
		rank: 'SPC',
		first_name: 'Synthetic',
		last_name: 'MapRetention' + tag + 'Expired' + index,
		slug: 'map-retention-' + tag + '-expired-' + index,
		archived_at: expiredAt
	}));
	const retained = [
		['recent', fixture.ids.orgA, fixture.ids.groupA, recentAt],
		['active', fixture.ids.orgA, fixture.ids.groupA, null],
		['foreignRecent', fixture.ids.orgB, fixture.ids.groupForeign, recentAt]
	].map(([key, organization_id, group_id, archived_at]) => ({
		id: randomUUID(),
		organization_id,
		group_id,
		archived_at,
		rank: 'SPC',
		first_name: 'Synthetic',
		last_name: 'MapRetention' + tag + key,
		slug: 'map-retention-' + tag + '-' + key.toLowerCase()
	}));
	const selected = [people[0], people.at(-1), retained[0], retained[2]];
	const documents = [];
	const counselings = [];
	const objects = [];
	function addFile(person, type, status, id = randomUUID()) {
		const pdf = new jsPDF();
		pdf.text('Synthetic retention ' + tag + ' ' + type + ' ' + status + ' ' + id, 10, 20);
		const bytes = Buffer.from(pdf.output('arraybuffer'));
		const filePath =
			type === 'document'
				? person.organization_id + '/personnel/' + person.id + '/documents/' + id + '-synthetic.pdf'
				: person.organization_id + '/counseling-records/' + person.id + '/' + id + '-synthetic.pdf';
		const base = {
			id,
			organization_id: person.organization_id,
			personnel_id: person.id,
			title: 'Synthetic ' + type + ' ' + status + ' ' + tag,
			file_path: filePath,
			archived_at: status === 'active' ? null : status === 'expired' ? expiredAt : recentAt,
			uploaded_by: fixture.actors.manager.id
		};
		if (type === 'document')
			documents.push({ ...base, file_size_bytes: bytes.length, content_type: 'application/pdf' });
		else counselings.push({ ...base, date_conducted: '2026-09-14', subject: base.title, status: 'completed' });
		objects.push({
			bucket: type === 'document' ? 'personnel-documents' : 'counseling-files',
			path: filePath,
			personnelId: person.id,
			rowId: id,
			size: bytes.length,
			sha256: createHash('sha256').update(bytes).digest('hex'),
			bytes
		});
	}
	for (const person of selected) {
		for (const status of ['active', 'recent', ...(person === people[0] ? ['expired'] : [])]) {
			for (const type of ['document', 'counseling']) addFile(person, type, status);
		}
	}
	const pageMarkerIds = {};
	if (kind === 'personnel-retention-dense') {
		// Metadata-only rows carry valid synthetic paths without stored objects. A
		// real final-page PDF detects truncated manifests in each bucket.
		for (const type of ['document', 'counseling']) {
			const rows = type === 'document' ? documents : counselings;
			for (let index = 0; index < 1000; index++) {
				const base = {
					id: randomUUID(),
					organization_id: people[0].organization_id,
					personnel_id: people[0].id,
					title: 'Synthetic dense ' + type + ' ' + tag + ' ' + index,
					file_path:
						type === 'document'
							? people[0].organization_id +
								'/personnel/' +
								people[0].id +
								'/documents/' +
								tag +
								'-metadata-' +
								index +
								'.pdf'
							: people[0].organization_id +
								'/counseling-records/' +
								people[0].id +
								'/' +
								tag +
								'-metadata-' +
								index +
								'.pdf',
					archived_at: null,
					uploaded_by: fixture.actors.manager.id
				};
				rows.push(
					type === 'document'
						? { ...base, file_size_bytes: 1, content_type: 'application/pdf' }
						: { ...base, date_conducted: '2026-09-14', subject: base.title, status: 'completed' }
				);
			}
			const marker = 'ffffffff-ffff-4fff-bfff-' + randomUUID().slice(-12);
			if (rows.some((row) => row.id >= marker)) throw new Error('Dense marker must sort after every seeded artifact.');
			pageMarkerIds[type] = marker;
			addFile(people[0], type, 'active', marker);
		}
	}
	// Unrelated real bytes without artifact metadata must survive the job.
	for (const bucket of ['personnel-documents', 'counseling-files']) {
		const pdf = new jsPDF();
		pdf.text('Synthetic unrelated retention object ' + tag + ' ' + bucket, 10, 20);
		const bytes = Buffer.from(pdf.output('arraybuffer'));
		objects.push({
			bucket,
			path: fixture.ids.orgA + '/verification-retention/' + tag + '/unrelated.pdf',
			size: bytes.length,
			sha256: createHash('sha256').update(bytes).digest('hex'),
			bytes
		});
	}
	const ratingId = randomUUID();
	const batches = [
		['personnel', [...people, ...retained]],
		['personnel_documents', documents],
		['counseling_records', counselings],
		[
			'leader_notes',
			[
				{
					id: randomUUID(),
					organization_id: fixture.ids.orgA,
					personnel_id: people[0].id,
					author: 'Synthetic',
					text: 'Active retention note ' + tag,
					archived_at: null
				}
			]
		],
		[
			'personnel_follow_ups',
			['open', 'completed'].map((status) => ({
				id: randomUUID(),
				organization_id: fixture.ids.orgA,
				personnel_id: people[0].id,
				title: 'Retention ' + status + ' ' + tag,
				status,
				created_by: fixture.actors.manager.id,
				completed_at: status === 'completed' ? '2026-09-14T12:00:00Z' : null,
				archived_at: null
			}))
		],
		[
			'rating_scheme_entries',
			[
				{
					id: ratingId,
					organization_id: fixture.ids.orgA,
					rated_person_id: fixture.ids.personA,
					eval_type: 'NCOER',
					rater_person_id: people[0].id,
					senior_rater_person_id: people[0].id,
					intermediate_rater_person_id: people[0].id,
					reviewer_person_id: people[0].id,
					rater_name: 'Retained synthetic rater',
					senior_rater_name: 'Retained synthetic senior',
					intermediate_rater_name: 'Retained synthetic intermediate',
					reviewer_name: 'Retained synthetic reviewer',
					rating_period_start: '2026-01-01',
					rating_period_end: '2026-12-31',
					status: 'active',
					notes: 'Retained evaluation ' + tag
				}
			]
		]
	];
	for (const file of objects) file.uploadId = randomUUID();
	const files = objects.map(({ uploadId, bucket, path, personnelId, rowId, size, sha256 }) => ({
		uploadId,
		bucket,
		path,
		personnelId,
		rowId,
		size,
		sha256
	}));
	for (const [table, rows] of batches) {
		for (const organization of ['orgA', 'orgB']) {
			const ids = rows.filter((row) => row.organization_id === fixture.ids[organization]).map((row) => row.id);
			if (ids.length)
				ownedState.seeded.push({
					kind,
					tag,
					table,
					organization,
					ids,
					...(table === 'personnel' && organization === 'orgA' ? { files } : {})
				});
		}
	}
	await save(ownedState);
	for (const [table, rows] of batches) {
		for (let offset = 0; offset < rows.length; offset += 100)
			checked(await client.from(table).insert(rows.slice(offset, offset + 100)));
	}
	for (const file of objects) await registeredFixtureFileWrite(client, fixture, file);
	return {
		kind,
		tag,
		expiredAt,
		recentAt,
		expiredCount: people.length,
		denseChildCountPerBucket: kind === 'personnel-retention-dense' ? 1001 : 0,
		pageMarkerIds,
		expiredIds: people.map((person) => person.id),
		people: selected.map(({ id, last_name, slug, organization_id }) => ({ id, last_name, slug, organization_id })),
		retained,
		ratingId,
		rows: batches.map(([table, rows]) => ({ table, ids: rows.map((row) => row.id) })),
		files
	};
}

export async function readRetentionFiles(client, ownedState) {
	const files = ownedState.seeded.flatMap((item) => item.files ?? []);
	const observations = [];
	for (const file of files) {
		const slash = file.path.lastIndexOf('/');
		const prefix = file.path.slice(0, slash);
		const filename = file.path.slice(slash + 1);
		const bucket = client.storage.from(file.bucket);
		const entries = checked(await bucket.list(prefix, { search: filename }));
		if (!entries.some((entry) => entry.name === filename)) {
			observations.push({ ...file, present: false });
			continue;
		}
		const blob = checked(await bucket.download(file.path));
		const bytes = Buffer.from(await blob.arrayBuffer());
		observations.push({
			...file,
			present: true,
			observedSize: bytes.length,
			observedSha256: createHash('sha256').update(bytes).digest('hex')
		});
	}
	return { files: observations };
}
