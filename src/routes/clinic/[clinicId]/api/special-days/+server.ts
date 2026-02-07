import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDefaultFederalHolidays } from '$lib/utils/federalHolidays';

export const POST: RequestHandler = async ({ params, request, locals }) => {
	const user = locals.user;
	if (!user) throw error(401, 'Unauthorized');

	const { clinicId } = params;
	const body = await request.json();

	// Handle bulk reset of federal holidays
	if (body.action === 'resetFederalHolidays') {
		// Delete existing federal holidays
		await locals.supabase
			.from('special_days')
			.delete()
			.eq('clinic_id', clinicId)
			.eq('type', 'federal-holiday');

		// Re-insert defaults
		const holidays = getDefaultFederalHolidays();
		const rows = holidays.map((h) => ({
			clinic_id: clinicId,
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
			.eq('clinic_id', clinicId)
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
			clinic_id: clinicId,
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

	const { clinicId } = params;
	const body = await request.json();
	const { id } = body;

	if (!id) throw error(400, 'Missing id');

	const { error: dbError } = await locals.supabase
		.from('special_days')
		.delete()
		.eq('id', id)
		.eq('clinic_id', clinicId);

	if (dbError) throw error(500, dbError.message);

	return json({ success: true });
};
