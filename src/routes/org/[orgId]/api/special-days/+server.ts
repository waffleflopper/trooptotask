import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDefaultFederalHolidays } from '$lib/utils/federalHolidays';
import { requireEditPermission } from '$lib/server/permissions';

export const POST: RequestHandler = async ({ params, request, locals }) => {
	const user = locals.user;
	if (!user) throw error(401, 'Unauthorized');

	const { orgId } = params;
	await requireEditPermission(locals.supabase, orgId, user.id, 'calendar');

	const body = await request.json();

	// Handle bulk reset of federal holidays
	if (body.action === 'resetFederalHolidays') {
		// Delete existing federal holidays
		await locals.supabase
			.from('special_days')
			.delete()
			.eq('organization_id', orgId)
			.eq('type', 'federal-holiday');

		// Re-insert defaults
		const holidays = getDefaultFederalHolidays();
		const rows = holidays.map((h) => ({
			organization_id: orgId,
			date: h.date,
			name: h.name,
			type: h.type
		}));

		for (let i = 0; i < rows.length; i += 50) {
			await locals.supabase.from('special_days').insert(rows.slice(i, i + 50));
		}

		// Return all special days
		const { data: allDays } = await locals.supabase
			.from('special_days')
			.select()
			.eq('organization_id', orgId)
			.order('date');

		return json(
			(allDays ?? []).map((d: any) => ({
				id: d.id,
				date: d.date,
				name: d.name,
				type: d.type
			}))
		);
	}

	const { data, error: dbError } = await locals.supabase
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

export const DELETE: RequestHandler = async ({ params, request, locals }) => {
	const user = locals.user;
	if (!user) throw error(401, 'Unauthorized');

	const { orgId } = params;
	await requireEditPermission(locals.supabase, orgId, user.id, 'calendar');

	const body = await request.json();
	const { id } = body;

	if (!id) throw error(400, 'Missing id');

	const { error: dbError } = await locals.supabase
		.from('special_days')
		.delete()
		.eq('id', id)
		.eq('organization_id', orgId);

	if (dbError) throw error(500, dbError.message);

	return json({ success: true });
};
