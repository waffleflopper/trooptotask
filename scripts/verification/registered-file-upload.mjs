// Disposable, provider-seeded prerequisites only; this is not native upload proof.
// The caller records every uploadId/path before setup effects. Unknown outcomes
// retain their registration until this owned worker is disposed. `open` keeps the
// registration unsettled, like an upload whose attachment never completed.
export function fixtureUploadActor(fixture, organization) {
	return organization === 'orgA'
		? (fixture.actors.orgOwner ?? fixture.actors.manager)
		: (fixture.actors.orgSettingsPeer ?? fixture.actors.personnelForeign);
}

export async function registeredFixtureFileWrite(client, fixture, file) {
	const orgId = file.path.split('/')[0].toLowerCase();
	const organization = ['orgA', 'orgB'].find((name) => fixture.ids[name] === orgId);
	const actor = fixtureUploadActor(fixture, organization);
	if (!organization || !actor?.id || !file.uploadId)
		throw new Error('A recorded owned fixture file registration is required.');
	const args = {
		p_upload_id: file.uploadId,
		p_organization_id: orgId,
		p_actor_id: actor.id,
		p_bucket_id: file.bucket,
		p_object_name: file.path
	};
	const registered = await client.rpc('register_organization_file_upload', args);
	if (registered.error || registered.data !== file.uploadId)
		throw new Error('Owned fixture file registration was not acknowledged.');
	const bucket = client.storage.from(file.bucket);
	const uploaded = file.copyFrom
		? await bucket.copy(file.copyFrom, file.path)
		: await bucket.upload(file.path, file.bytes, {
				contentType: file.path.endsWith('.pdf') ? 'application/pdf' : 'text/plain',
				upsert: false
			});
	const expectedKey = `${file.bucket}/${file.path}`;
	const acknowledged = file.copyFrom
		? uploaded.data?.path === expectedKey
		: uploaded.data?.path === file.path && uploaded.data?.fullPath === expectedKey;
	if (uploaded.error || !acknowledged)
		throw new Error(
			'Owned fixture file write was not acknowledged: ' + (uploaded.error?.message ?? 'missing exact provider key')
		);

	if (file.open) return;
	const settled = await client.rpc('settle_organization_file_upload', args);
	if (settled.error || settled.data !== true) throw new Error('Owned fixture file completion was not acknowledged.');
}
