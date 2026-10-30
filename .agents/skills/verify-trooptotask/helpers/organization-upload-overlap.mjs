// Provider proof around an actual native document upload. The caller owns and
// authenticates the disposable worker; this helper accepts no URL or credentials.
const buckets = ['counseling-files', 'personnel-documents', 'training-certificates'];

function checked(result) {
	if (result.error) throw new Error('Owned overlap provider operation failed.');
	return result.data;
}

export async function prepareUploadOverlap(client, { orgId, personId, tag }) {
	const organization = checked(await client.from('organizations').select('id,name').eq('id', orgId).single());
	const documents = checked(
		await client.from('personnel_documents').select('id').eq('organization_id', orgId).eq('personnel_id', personId)
	);
	if (documents.length) throw new Error('Use a fresh owned Person with no document rows.');
	const inventory = async (bucket) => {
		const result = checked(
			await client.storage.from(bucket).listV2({ prefix: '', with_delimiter: false, limit: 1000 })
		);
		if (!result || !Array.isArray(result.objects) || result.hasNext !== false || result.folders?.length !== 0)
			throw new Error('Use a fresh complete owned Storage inventory.');
		if (result.objects.some((object) => typeof object.name !== 'string'))
			throw new Error('Owned Storage inventory has an invalid object name.');
		return result.objects.filter((object) => object.name.split('/')[0].toLowerCase() === orgId.toLowerCase());
	};
	const cleanup = [];
	for (const bucket of buckets) {
		const target = await inventory(bucket);
		const paths = target.map((object) => object.name);
		if (new Set(paths).size !== paths.length) throw new Error('Owned Storage inventory has duplicate paths.');
		if (paths.length) {
			const removed = checked(await client.storage.from(bucket).remove(paths));
			const acknowledged = new Set(removed?.map((object) => object.name));
			if (
				!Array.isArray(removed) ||
				removed.length !== paths.length ||
				acknowledged.size !== paths.length ||
				paths.some((name) => !acknowledged.has(name))
			)
				throw new Error('Initial owned cleanup was not completely acknowledged.');
			cleanup.push({ bucket, paths, acknowledged: [...acknowledged] });
		}
	}
	const scans = [];
	for (const bucket of buckets) {
		const target = await inventory(bucket);
		if (target.length) throw new Error('The final-scan overlap requires an empty target.');
		scans.push({ bucket, objects: target, hasNext: false });
	}
	return { orgId, personId, tag, name: organization.name, title: `D17 overlap ${tag}`, cleanup, scans };
}

export async function inspectUploadOverlap(client, prepared) {
	const rows = checked(
		await client
			.from('personnel_documents')
			.select('*')
			.eq('organization_id', prepared.orgId)
			.eq('personnel_id', prepared.personId)
	);
	if (
		rows.length !== 1 ||
		rows[0].title !== prepared.title ||
		!rows[0].file_path?.startsWith(`${prepared.orgId}/personnel/${prepared.personId}/documents/`)
	)
		throw new Error('Complete exactly the recorded native document upload first.');
	const row = rows[0];
	const blob = checked(await client.storage.from('personnel-documents').download(row.file_path));
	return { row, bytes: Buffer.from(await blob.arrayBuffer()) };
}

export async function deleteAfterUploadOverlap(ownerClient, prepared) {
	// Same ordinary SDK boundary as destructionProvider.deleteConfirmedTarget.
	// This is provider concurrency proof, not application Identity/step-up proof.
	const result = await ownerClient
		.from('organizations')
		.delete()
		.eq('id', prepared.orgId)
		.eq('name', prepared.name)
		.select('id');
	return {
		acknowledged: !result.error && result.data?.length === 1 && result.data[0].id === prepared.orgId,
		returnedIds: result.data?.map((row) => row.id) ?? [],
		error: result.error ? { code: result.error.code, message: result.error.message } : null
	};
}
