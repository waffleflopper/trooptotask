import { json, error } from '@sveltejs/kit';
import { getDefaultFederalHolidays } from '$features/calendar/utils/federalHolidays';
import { apiRoute } from '$lib/server/apiRoute';
import { SpecialDayEntity } from '$lib/server/entities/specialDay';

export const POST = apiRoute({ permission: { edit: 'calendar' }, audit: 'special_day' }, async (routeCtx, event) => {
	const { supabase, orgId } = routeCtx;
	const body = await event.request.json();

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

		routeCtx.audit('special_day.federal_holidays_reset');
		return json(SpecialDayEntity.fromDbArray((allDays ?? []) as Record<string, unknown>[]));
	}

	const insertData = SpecialDayEntity.toDbInsert(body, orgId);

	const { data, error: dbError } = await supabase.from('special_days').insert(insertData).select().single();

	if (dbError) throw error(500, dbError.message);

	return json(SpecialDayEntity.fromDb(data as Record<string, unknown>));
});

export const DELETE = apiRoute(
	{ permission: { edit: 'calendar' }, audit: 'special_day' },
	async ({ supabase, orgId }, event) => {
		const body = await event.request.json();
		const { id } = body;

		if (!id) throw error(400, 'Missing id');

		const { error: dbError } = await supabase.from('special_days').delete().eq('id', id).eq('organization_id', orgId);

		if (dbError) throw error(500, dbError.message);

		return json({ success: true });
	}
);
