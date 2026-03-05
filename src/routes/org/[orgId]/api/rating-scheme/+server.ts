import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireEditPermission } from '$lib/server/permissions';
import { getApiContext } from '$lib/server/supabase';

function toClient(row: any) {
	return {
		id: row.id,
		ratedPersonId: row.rated_person_id,
		evalType: row.eval_type,
		raterPersonId: row.rater_person_id,
		raterName: row.rater_name,
		seniorRaterPersonId: row.senior_rater_person_id,
		seniorRaterName: row.senior_rater_name,
		intermediateRaterPersonId: row.intermediate_rater_person_id,
		intermediateRaterName: row.intermediate_rater_name,
		reviewerPersonId: row.reviewer_person_id,
		reviewerName: row.reviewer_name,
		ratingPeriodStart: row.rating_period_start,
		ratingPeriodEnd: row.rating_period_end,
		status: row.status,
		notes: row.notes
	};
}

export const POST: RequestHandler = async ({ params, request, locals, cookies }) => {
	const { orgId } = params;
	const { supabase, userId, isSandbox } = getApiContext(locals, cookies, orgId);

	if (!isSandbox) {
		await requireEditPermission(supabase, orgId, userId!, 'personnel');
	}

	const body = await request.json();

	const row = {
		organization_id: orgId,
		rated_person_id: body.ratedPersonId,
		eval_type: body.evalType,
		rater_person_id: body.raterPersonId || null,
		rater_name: body.raterName || null,
		senior_rater_person_id: body.seniorRaterPersonId || null,
		senior_rater_name: body.seniorRaterName || null,
		intermediate_rater_person_id: body.intermediateRaterPersonId || null,
		intermediate_rater_name: body.intermediateRaterName || null,
		reviewer_person_id: body.reviewerPersonId || null,
		reviewer_name: body.reviewerName || null,
		rating_period_start: body.ratingPeriodStart,
		rating_period_end: body.ratingPeriodEnd,
		status: body.status || 'active',
		notes: body.notes || null
	};

	const { data, error: dbError } = await supabase
		.from('rating_scheme_entries')
		.insert(row)
		.select()
		.single();

	if (dbError) throw error(500, dbError.message);

	return json(toClient(data));
};

export const PUT: RequestHandler = async ({ params, request, locals, cookies }) => {
	const { orgId } = params;
	const { supabase, userId, isSandbox } = getApiContext(locals, cookies, orgId);

	if (!isSandbox) {
		await requireEditPermission(supabase, orgId, userId!, 'personnel');
	}

	const body = await request.json();
	const { id, ...fields } = body;

	if (!id) throw error(400, 'Missing id');

	const updates: Record<string, unknown> = {};
	if (fields.ratedPersonId !== undefined) updates.rated_person_id = fields.ratedPersonId;
	if (fields.evalType !== undefined) updates.eval_type = fields.evalType;
	if (fields.raterPersonId !== undefined) updates.rater_person_id = fields.raterPersonId || null;
	if (fields.raterName !== undefined) updates.rater_name = fields.raterName || null;
	if (fields.seniorRaterPersonId !== undefined) updates.senior_rater_person_id = fields.seniorRaterPersonId || null;
	if (fields.seniorRaterName !== undefined) updates.senior_rater_name = fields.seniorRaterName || null;
	if (fields.intermediateRaterPersonId !== undefined) updates.intermediate_rater_person_id = fields.intermediateRaterPersonId || null;
	if (fields.intermediateRaterName !== undefined) updates.intermediate_rater_name = fields.intermediateRaterName || null;
	if (fields.reviewerPersonId !== undefined) updates.reviewer_person_id = fields.reviewerPersonId || null;
	if (fields.reviewerName !== undefined) updates.reviewer_name = fields.reviewerName || null;
	if (fields.ratingPeriodStart !== undefined) updates.rating_period_start = fields.ratingPeriodStart;
	if (fields.ratingPeriodEnd !== undefined) updates.rating_period_end = fields.ratingPeriodEnd;
	if (fields.status !== undefined) updates.status = fields.status;
	if (fields.notes !== undefined) updates.notes = fields.notes || null;

	const { data, error: dbError } = await supabase
		.from('rating_scheme_entries')
		.update(updates)
		.eq('id', id)
		.eq('organization_id', orgId)
		.select()
		.single();

	if (dbError) throw error(500, dbError.message);

	return json(toClient(data));
};

export const DELETE: RequestHandler = async ({ params, request, locals, cookies }) => {
	const { orgId } = params;
	const { supabase, userId, isSandbox } = getApiContext(locals, cookies, orgId);

	if (!isSandbox) {
		await requireEditPermission(supabase, orgId, userId!, 'personnel');
	}

	const body = await request.json();
	const { id } = body;

	if (!id) throw error(400, 'Missing id');

	const { error: dbError } = await supabase
		.from('rating_scheme_entries')
		.delete()
		.eq('id', id)
		.eq('organization_id', orgId);

	if (dbError) throw error(500, dbError.message);

	return json({ success: true });
};
