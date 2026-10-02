import { registeredFixtureFileWrite } from '../../../../scripts/verification/registered-file-upload.mjs';
import { createHash, randomUUID } from 'node:crypto';
import { jsPDF } from 'jspdf';

const expiredAt = '2000-01-01T12:00:00.000Z';
const checked = (result) => {
	if (result.error) throw new Error('Owned artifact retention provider operation failed: ' + result.error.message);
	return result.data;
};

// The whole cleanup manifest is saved before the first effect, including paths
// that an interrupted setup never reaches. Parents stay active throughout.
export async function seedArtifactRetention({ client, fixture, kind, tag, ownedState, save }) {
	if (!['artifact-retention', 'artifact-retention-1001'].includes(kind))
		throw new Error('Use an owned artifact retention seed.');
	const recentAt = new Date(Date.now() - 86400000).toISOString();
	const expiredCountPerFamily = kind === 'artifact-retention-1001' ? 1001 : 1;
	const parents = ['orgA', 'orgB'].map((organization) => ({
		organization,
		row: {
			id: randomUUID(),
			organization_id: fixture.ids[organization],
			group_id: fixture.ids[organization === 'orgA' ? 'groupA' : 'groupForeign'],
			rank: 'SPC',
			first_name: 'Synthetic',
			last_name: 'ArtifactRetention' + tag + (organization === 'orgA' ? 'Alpha' : 'Foreign'),
			slug: 'artifact-retention-' + tag + '-' + organization.toLowerCase(),
			archived_at: null
		}
	}));
	const rows = [
		{ table: 'personnel_follow_ups', records: [] },
		{ table: 'counseling_records', records: [] },
		{ table: 'personnel_documents', records: [] },
		{ table: 'leader_notes', records: [] }
	];
	const objects = [];
	const pageMarkerIds = {};
	function filePath(parent, table, id, filename = 'synthetic.pdf') {
		return table === 'personnel_documents'
			? `${parent.organization_id}/personnel/${parent.id}/documents/${id}-${filename}`
			: `${parent.organization_id}/counseling-records/${parent.id}/${id}-${filename}`;
	}
	function addObject(parent, table, id, classification, path = filePath(parent, table, id)) {
		const pdf = new jsPDF();
		pdf.text('Synthetic artifact retention ' + tag + ' ' + table + ' ' + classification + ' ' + id, 10, 20);
		const bytes = Buffer.from(pdf.output('arraybuffer'));
		const object = {
			bucket: table === 'personnel_documents' ? 'personnel-documents' : 'counseling-files',
			path,
			organizationId: parent.organization_id,
			personnelId: parent.id,
			rowId: classification === 'unrelated' ? null : id,
			classification,
			size: bytes.length,
			sha256: createHash('sha256').update(bytes).digest('hex')
		};
		objects.push({ ...object, bytes });
		return { ...object, stored: true };
	}
	function addArtifact(family, parent, classification, id = randomUUID(), stored = true) {
		const archivedAt =
			classification === 'expired'
				? expiredAt
				: classification.endsWith('Recent') || classification === 'recent'
					? recentAt
					: null;
		const foreign = parent.organization_id === fixture.ids.orgB;
		const actor = fixture.actors[foreign ? 'personnelForeign' : 'manager'];
		const title = 'Synthetic artifact retention ' + classification + ' ' + tag + ' ' + id;
		const row = {
			id,
			organization_id: parent.organization_id,
			personnel_id: parent.id,
			archived_at: archivedAt
		};
		let object;
		if (family.table === 'leader_notes') {
			Object.assign(row, { author: foreign ? 'Synthetic Foreign' : 'Synthetic Alpha', text: title });
		} else if (family.table === 'personnel_follow_ups') {
			Object.assign(row, {
				title,
				notes: 'Synthetic retained Follow-up history ' + tag,
				status: archivedAt ? 'archived' : classification === 'completedHistory' ? 'completed' : 'open',
				created_by: actor.id,
				completed_at: archivedAt ?? (classification === 'completedHistory' ? recentAt : null)
			});
		} else {
			const path = filePath(parent, family.table, id);
			object = stored
				? addObject(parent, family.table, id, classification, path)
				: {
						bucket: family.table === 'personnel_documents' ? 'personnel-documents' : 'counseling-files',
						path,
						organizationId: parent.organization_id,
						personnelId: parent.id,
						rowId: id,
						classification,
						stored: false,
						size: null,
						sha256: null
					};
			Object.assign(row, { title, file_path: path, uploaded_by: actor.id });
			if (family.table === 'personnel_documents') {
				Object.assign(row, { file_size_bytes: object.size ?? 1, content_type: 'application/pdf' });
			} else {
				Object.assign(row, {
					date_conducted: (archivedAt ?? recentAt).slice(0, 10),
					subject: title,
					summary: 'Synthetic counseling retention ' + tag,
					status: 'completed'
				});
			}
		}
		family.records.push({ classification, row, ...(object ? { object } : {}) });
	}
	for (const family of rows) {
		for (let index = 0; index < expiredCountPerFamily; index++) {
			const marker = expiredCountPerFamily > 1 && index === expiredCountPerFamily - 1;
			const id = marker ? 'ffffffff-ffff-4fff-bfff-' + randomUUID().slice(-12) : randomUUID();
			if (marker) {
				if (family.records.some((entry) => entry.row.id >= id))
					throw new Error('Artifact retention marker must sort after its expired cohort.');
				pageMarkerIds[family.table] = id;
			}
			// The large fixture stores only first/last expired witnesses. Remaining
			// file-bearing rows have valid paths but deliberately no Storage object.
			addArtifact(family, parents[0].row, 'expired', id, index === 0 || marker);
		}
		for (const classification of ['active', 'recent']) addArtifact(family, parents[0].row, classification);
		for (const classification of ['foreignActive', 'foreignRecent'])
			addArtifact(family, parents[1].row, classification);
		if (family.table === 'personnel_follow_ups') addArtifact(family, parents[0].row, 'completedHistory');
	}
	for (const table of ['personnel_documents', 'counseling_records']) {
		const id = randomUUID();
		addObject(parents[0].row, table, id, 'unrelated', filePath(parents[0].row, table, id, 'unrelated.pdf'));
	}
	for (const file of objects) file.uploadId = randomUUID();
	const files = objects.map(({ bytes: _bytes, ...file }) => file);
	const batches = [
		['personnel', parents.map((parent) => parent.row)],
		...rows.map((family) => [family.table, family.records.map((entry) => entry.row)])
	];
	for (const [table, records] of batches) {
		for (const organization of ['orgA', 'orgB']) {
			const ids = records.filter((row) => row.organization_id === fixture.ids[organization]).map((row) => row.id);
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
	for (const [table, records] of batches) {
		for (let offset = 0; offset < records.length; offset += 100)
			checked(await client.from(table).insert(records.slice(offset, offset + 100)));
	}
	for (const file of objects) await registeredFixtureFileWrite(client, fixture, file);
	return {
		kind,
		tag,
		expiredAt,
		recentAt,
		// Fresh owned Organization creation uses the schema default; this helper
		// neither reads nor changes settings. Confirm them in the run readback.
		retentionMonthsAssumption: 36,
		expiredCountPerFamily,
		parentIds: Object.fromEntries(parents.map((parent) => [parent.organization, parent.row.id])),
		parents,
		pageMarkerIds,
		rows,
		files
	};
}
