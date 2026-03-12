import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getApiContext } from '$lib/server/supabase';
import { auditLog } from '$lib/server/auditLog';

// Upload signed scan
export const POST: RequestHandler = async ({ params, request, locals, cookies }) => {
	const { orgId, id } = params;
	const { supabase, userId } = getApiContext(locals, cookies, orgId);

	const formData = await request.formData();
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

	auditLog(
		{
			action: 'sign_in_roster.scan_uploaded',
			resourceType: 'sign_in_roster',
			resourceId: id,
			orgId,
			details: { actor: locals.user?.email ?? userId }
		},
		{ userId }
	);

	return json({ signedFilePath: storagePath });
};

// Remove signed scan
export const DELETE: RequestHandler = async ({ params, locals, cookies }) => {
	const { orgId, id } = params;
	const { supabase, userId } = getApiContext(locals, cookies, orgId);

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
