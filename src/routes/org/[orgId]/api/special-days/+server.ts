import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDefaultFederalHolidays } from '$features/calendar/utils/federalHolidays';
import { createPermissionContext } from '$lib/server/permissionContext';
import { getApiContext } from '$lib/server/supabase';
import { checkReadOnly } from '$lib/server/read-only-guard';

export const POST: RequestHandler = async ({ params, request, locals, cookies }) => {
	const { orgId } = params;
	const { supabase, userId, isSandbox } = getApiContext(locals, cookies, orgId);

	if (!isSandbox) {
		const ctx = await createPermissionContext(supabase, userId!, orgId);
		ctx.requireEdit('calendar');
	}

	const blocked = await checkReadOnly(supabase, orgId);
	if (blocked) return blocked;

	const body = await request.json();

	// Handle bulk reset of federal holidays
	if (body.action === 'resetFederalHolidays') {
		// Delete existing federal holidays
		await supabase.from('special_days').delete().eq('organization_id', orgId).eq('type', 'federal-holiday');

		// Re-insert defaults
		const holidays = getDefaultFederalHolidays();
		const rows = holidays.map((h) => ({
			organization_id: orgId,
			date: h.date,
			name: h.name,
			type: h.type
		}));

		for (let i = 0; i < rows.length; i += 50) {
			await supabase.from('special_days').insert(rows.slice(i, i + 50));
		}

		// Return all special days
		const { data: allDays } = await supabase.from('special_days').select().eq('organization_id', orgId).order('date');

		return json(
			(allDays ?? []).map((d: Record<string, unknown>) => ({
				id: d.id,
				date: d.date,
				name: d.name,
				type: d.type
			}))
		);
	}

	const { data, error: dbError } = await supabase
		.from('special_days')
		.insert({
			organization_id: orgId,
			date: body.date,
			name: body.name,
			type: body.type
		})
		.select()
		.single();

	if (dbError) throw error(500, dbError.message);

	return json({
		id: data.id,
		date: data.date,
		name: data.name,
		type: data.type
	});
};

export const DELETE: RequestHandler = async ({ params, request, locals, cookies }) => {
	const { orgId } = params;
	const { supabase, userId, isSandbox } = getApiContext(locals, cookies, orgId);

	if (!isSandbox) {
		const ctx = await createPermissionContext(supabase, userId!, orgId);
		ctx.requireEdit('calendar');
	}

	const blocked = await checkReadOnly(supabase, orgId);
	if (blocked) return blocked;

	const body = await request.json();
	const { id } = body;

	if (!id) throw error(400, 'Missing id');

	const { error: dbError } = await supabase.from('special_days').delete().eq('id', id).eq('organization_id', orgId);

	if (dbError) throw error(500, dbError.message);

	return json({ success: true });
};
