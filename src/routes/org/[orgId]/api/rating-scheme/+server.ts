import { json, error } from '@sveltejs/kit';
import { apiRoute } from '$lib/server/apiRoute';
import { notifyAdmins } from '$lib/server/notifications';
import { RatingSchemeEntryEntity } from '$lib/server/entities/ratingSchemeEntry';

export const POST = apiRoute(
	{ permission: { edit: 'personnel' }, audit: 'rating_scheme' },
	async ({ supabase, orgId, ctx }, event) => {
		const body = await event.request.json();

		if (body.ratedPersonId) {
			await ctx.requireGroupAccess(supabase, body.ratedPersonId);
		}

		const row = RatingSchemeEntryEntity.toDbInsert(body, orgId);
		// Coerce falsy strings to null for optional fields (matching original || null behavior)
		for (const key of Object.keys(row)) {
			if (key !== 'organization_id' && row[key] === '') row[key] = null;
		}

		const { data, error: dbError } = await supabase.from('rating_scheme_entries').insert(row).select().single();

		if (dbError) throw error(500, dbError.message);

		return json(RatingSchemeEntryEntity.fromDb(data as Record<string, unknown>));
	}
);

export const PUT = apiRoute(
	{ permission: { edit: 'personnel' }, audit: 'rating_scheme' },
	async ({ supabase, orgId, ctx }, event) => {
		const body = await event.request.json();
		const { id, ...fields } = body;

		if (!id) throw error(400, 'Missing id');

		await ctx.requireGroupAccessByRecord(supabase, 'rating_scheme_entries', id, orgId, 'rated_person_id');

		const updates = RatingSchemeEntryEntity.toDbUpdate({ id, ...fields });
		// Coerce falsy strings to null for optional fields (matching original || null behavior)
		for (const key of Object.keys(updates)) {
			if (updates[key] === '') updates[key] = null;
		}

		const { data, error: dbError } = await supabase
			.from('rating_scheme_entries')
			.update(updates)
			.eq('id', id)
			.eq('organization_id', orgId)
			.select()
			.single();

		if (dbError) throw error(500, dbError.message);

		return json(RatingSchemeEntryEntity.fromDb(data as Record<string, unknown>));
	}
);

export const DELETE = apiRoute(
	{ permission: { edit: 'personnel' }, audit: 'rating_scheme' },
	async ({ supabase, orgId, userId, ctx }, event) => {
		const body = await event.request.json();
		const { id } = body;

		if (!id) throw error(400, 'Missing id');

		await ctx.requireGroupAccessByRecord(supabase, 'rating_scheme_entries', id, orgId, 'rated_person_id');

		// Deletion approval for non-full-editors
		if (ctx && !ctx.isPrivileged && !ctx.isFullEditor) {
			return json({ requiresApproval: true }, { status: 202 });
		}

		// Capture entry details before deletion for notification
		const { data: deletedEntry } = await supabase
			.from('rating_scheme_entries')
			.select('eval_type')
			.eq('id', id)
			.eq('organization_id', orgId)
			.single();
		const deletedName = (deletedEntry as Record<string, unknown> | null)?.eval_type;

		const { error: dbError } = await supabase
			.from('rating_scheme_entries')
			.delete()
			.eq('id', id)
			.eq('organization_id', orgId);

		if (dbError) throw error(500, dbError.message);

		await notifyAdmins(orgId, userId, {
			type: 'config_type_deleted',
			title: 'Rating Scheme Entry Deleted',
			message: `"${event.locals.user?.email}" deleted the rating scheme entry "${deletedName ?? 'unknown'}".`
		});

		return json({ success: true });
	}
);
