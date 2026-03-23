import { json, error } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import { buildContext } from '$lib/server/adapters/httpAdapter';
import { getApiContext } from '$lib/server/supabase';

// Get signed URL for download
export const GET = async (event: RequestEvent) => {
	const orgId = event.params.orgId as string;
	const { supabase } = getApiContext(event.locals, event.cookies, orgId);

	const id = event.params.id;

	const { data: roster } = await supabase
		.from('sign_in_rosters')
		.select('signed_file_path')
		.eq('id', id)
		.eq('organization_id', orgId)
		.single();

	if (!roster?.signed_file_path) throw error(404, 'No signed file found');

	const { data: signedUrl } = await supabase.storage
		.from('counseling-files')
		.createSignedUrl(roster.signed_file_path, 300);

	if (!signedUrl) throw error(500, 'Failed to create download URL');

	return json({ url: signedUrl.signedUrl });
};

// Upload signed scan
export const POST = async (event: RequestEvent) => {
	const ctx = await buildContext(event);
	const orgId = event.params.orgId as string;
	const { supabase } = getApiContext(event.locals, event.cookies, orgId);

	const id = event.params.id;

	const formData = await event.request.formData();
	const file = formData.get('file') as File;

	if (!file) return json({ error: 'No file provided' }, { status: 400 });
	if (file.size > 10 * 1024 * 1024) return json({ error: 'File must be under 10MB' }, { status: 400 });

	const sanitizedName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
	const storagePath = `${orgId}/sign-in-rosters/${id}/${sanitizedName}`;

	const { error: uploadError } = await supabase.storage
		.from('counseling-files')
		.upload(storagePath, file, { upsert: true });

	if (uploadError) throw error(500, uploadError.message);

	const { error: dbError } = await supabase
		.from('sign_in_rosters')
		.update({ signed_file_path: storagePath })
		.eq('id', id)
		.eq('organization_id', orgId);

	if (dbError) throw error(500, dbError.message);

	ctx.audit.log({
		action: 'sign_in_roster.scan_uploaded',
		resourceType: 'sign_in_roster',
		resourceId: id,
		details: { actor: event.locals.user?.email ?? ctx.auth.userId }
	});

	return json({ signedFilePath: storagePath });
};

// Remove signed scan
export const DELETE = async (event: RequestEvent) => {
	const orgId = event.params.orgId as string;
	const { supabase } = getApiContext(event.locals, event.cookies, orgId);

	const id = event.params.id;

	const { data: roster } = await supabase
		.from('sign_in_rosters')
		.select('signed_file_path')
		.eq('id', id)
		.eq('organization_id', orgId)
		.single();

	if (!roster) throw error(404, 'Roster not found');

	if (roster.signed_file_path) {
		await supabase.storage.from('counseling-files').remove([roster.signed_file_path]);
	}

	const { error: dbError } = await supabase
		.from('sign_in_rosters')
		.update({ signed_file_path: null })
		.eq('id', id)
		.eq('organization_id', orgId);

	if (dbError) throw error(500, dbError.message);

	return json({ success: true });
};
