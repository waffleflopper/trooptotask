import { randomUUID } from 'node:crypto';
import { jsPDF } from 'jspdf';
import { registeredFixtureFileWrite } from '../../../../scripts/verification/registered-file-upload.mjs';

// Temporary prerequisites, recorded before insertion for interruption-safe cleanup.
export async function seedDeletionSources({ client, fixture, tag, ownedState, save }) {
	const sources = {};
	const batches = [];
	const files = [];
	const checked = (result) => {
		if (result.error) throw new Error(`Disposable deletion fixture failed: ${result.error.message}`);
		return result.data;
	};
	for (const organization of ['orgA', 'orgB']) {
		const organizationId = fixture.ids[organization];
		const groupId = fixture.ids[organization === 'orgA' ? 'groupA' : 'groupForeign'];
		const ids = Object.fromEntries(
			['personnel', 'parent', 'training_type', 'personnel_training', 'counseling_record', 'rating_scheme_entry'].map(
				(key) => [key, randomUUID()]
			)
		);
		const label = `Deletion ${organization} ${tag}`;
		sources[organization] = { ...ids, label };
		batches.push([
			'personnel',
			organization,
			['personnel', 'parent'].map((key) => ({
				id: ids[key],
				organization_id: organizationId,
				group_id: groupId,
				first_name: 'Synthetic',
				last_name: `${label} ${key}`,
				rank: 'SGT',
				slug: `deletion-${organization.toLowerCase()}-${key}-${tag}`
			}))
		]);
		batches.push([
			'training_types',
			organization,
			[{ id: ids.training_type, organization_id: organizationId, name: label, expiration_months: 12 }]
		]);
		batches.push([
			'personnel_trainings',
			organization,
			[
				{
					id: ids.personnel_training,
					organization_id: organizationId,
					personnel_id: ids.parent,
					training_type_id: ids.training_type,
					completion_date: fixture.dates.ui,
					notes: label
				}
			]
		]);
		batches.push([
			'rating_scheme_entries',
			organization,
			[
				{
					id: ids.rating_scheme_entry,
					organization_id: organizationId,
					rated_person_id: ids.parent,
					eval_type: 'NCOER',
					rater_name: 'Synthetic Rater',
					senior_rater_name: 'Synthetic Senior Rater',
					rating_period_start: '2026-01-01',
					rating_period_end: '2026-12-31',
					status: 'active',
					notes: label
				}
			]
		]);
		const filePath = `${organizationId}/counseling-records/${ids.parent}/${ids.counseling_record}-synthetic.pdf`;
		batches.push([
			'counseling_records',
			organization,
			[
				{
					id: ids.counseling_record,
					organization_id: organizationId,
					personnel_id: ids.parent,
					title: label,
					subject: label,
					date_conducted: fixture.dates.ui,
					status: 'completed',
					file_path: filePath,
					uploaded_by: fixture.actors[organization === 'orgA' ? 'orgOwner' : 'orgSettingsPeer'].id
				}
			]
		]);
		const pdf = new jsPDF();
		pdf.text(label, 10, 10);
		files.push({
			bucket: 'counseling-files',
			path: filePath,
			uploadId: randomUUID(),
			bytes: Buffer.from(pdf.output('arraybuffer'))
		});
	}
	for (const [table, organization, rows] of batches)
		ownedState.seeded.push({
			kind: 'deletion-sources',
			tag,
			table,
			organization,
			ids: rows.map((row) => row.id),
			...(table === 'personnel'
				? {
						files: files
							.filter((file) => file.path.startsWith(fixture.ids[organization] + '/'))
							.map(({ bytes: _bytes, ...file }) => file)
					}
				: {})
		});
	await save(ownedState);
	for (const [table, , rows] of batches) checked(await client.from(table).insert(rows));
	for (const file of files) await registeredFixtureFileWrite(client, fixture, file);
	return {
		tag,
		sources,
		files: files.map(({ bytes: _bytes, ...file }) => file),
		boundary: 'Provider-seeded prerequisites; not submission or native upload proof.'
	};
}

// Ordinary authenticated HTTP on the signed-in owned page; never provider credentials.
export async function requestDeletion(target, { origin, orgId, action, body }) {
	if (target.location.origin !== origin) throw new Error('Use an owned app page');
	if (!/^[0-9a-f-]{36}$/.test(orgId)) throw new Error('Use a synthetic Organization UUID');
	const fields = {
		list: ['status'],
		submit: ['resourceType', 'resourceId', 'resourceDescription', 'resourceUrl'],
		cancel: ['id'],
		review: ['id', 'action', 'denialReason']
	};
	if (!Object.hasOwn(fields, action) || !body || typeof body !== 'object' || Array.isArray(body))
		throw new Error('Unsupported deletion request');
	for (const [key, value] of Object.entries(body)) {
		if (!fields[action].includes(key) || (value !== null && typeof value !== 'string'))
			throw new Error('Use allowlisted scalar deletion fields');
	}
	const path = `/org/${orgId}/api/deletion-requests${action === 'review' ? '/review' : ''}${action === 'list' && body.status ? '?status=' + encodeURIComponent(body.status) : ''}`;
	const method = action === 'list' ? 'GET' : action === 'cancel' ? 'DELETE' : 'POST';
	const response = await target.fetch(path, {
		method,
		redirect: 'manual',
		...(method === 'GET' ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
	});
	return { request: { method, path, submitted: body }, status: response.status, body: await response.text() };
}

export async function requestPersonnelArchiveBatch(target, { origin, orgId, ids }) {
	if (target.location.origin !== origin) throw new Error('Use an owned app page');
	const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
	if (
		!uuid.test(orgId) ||
		!Array.isArray(ids) ||
		ids.length === 0 ||
		ids.some((id) => typeof id !== 'string' || !uuid.test(id))
	)
		throw new Error('Use a fixture Organization and a nonempty array of Personnel UUIDs');
	const path = `/org/${orgId}/api/personnel/archive-batch`;
	const body = { ids };
	const response = await target.fetch(path, {
		method: 'POST',
		redirect: 'manual',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(body)
	});
	return { request: { method: 'POST', path, submitted: body }, status: response.status, body: await response.text() };
}
