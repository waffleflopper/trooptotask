import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireEditPermission } from '$lib/server/permissions';
import { getApiContext } from '$lib/server/supabase';

export const POST: RequestHandler = async ({ params, request, locals, cookies }) => {
	const { orgId } = params;
	const { supabase, userId, isSandbox } = getApiContext(locals, cookies, orgId);

	if (!isSandbox) {
		await requireEditPermission(supabase, orgId, userId!, 'personnel');
	}

	const body = await request.json();

	const { data, error: dbError } = await supabase
		.from('counseling_records')
		.insert({
			organization_id: orgId,
			personnel_id: body.personnelId,
			counseling_type_id: body.counselingTypeId ?? null,
			date_conducted: body.dateConducted,
			subject: body.subject,
			key_points: body.keyPoints ?? null,
			plan_of_action: body.planOfAction ?? null,
			follow_up_date: body.followUpDate ?? null,
			status: body.status ?? 'draft',
			counselor_signed: body.counselorSigned ?? false,
			counselor_signed_at: body.counselorSignedAt ?? null,
			soldier_signed: body.soldierSigned ?? false,
			soldier_signed_at: body.soldierSignedAt ?? null
		})
		.select()
		.single();

	if (dbError) throw error(500, dbError.message);

	return json({
		id: data.id,
		personnelId: data.personnel_id,
		counselingTypeId: data.counseling_type_id,
		dateConducted: data.date_conducted,
		subject: data.subject,
		keyPoints: data.key_points,
		planOfAction: data.plan_of_action,
		followUpDate: data.follow_up_date,
		status: data.status,
		counselorSigned: data.counselor_signed,
		counselorSignedAt: data.counselor_signed_at,
		soldierSigned: data.soldier_signed,
		soldierSignedAt: data.soldier_signed_at
	});
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
	if (fields.counselingTypeId !== undefined) updates.counseling_type_id = fields.counselingTypeId;
	if (fields.dateConducted !== undefined) updates.date_conducted = fields.dateConducted;
	if (fields.subject !== undefined) updates.subject = fields.subject;
	if (fields.keyPoints !== undefined) updates.key_points = fields.keyPoints;
	if (fields.planOfAction !== undefined) updates.plan_of_action = fields.planOfAction;
	if (fields.followUpDate !== undefined) updates.follow_up_date = fields.followUpDate;
	if (fields.status !== undefined) updates.status = fields.status;
	if (fields.counselorSigned !== undefined) updates.counselor_signed = fields.counselorSigned;
	if (fields.counselorSignedAt !== undefined) updates.counselor_signed_at = fields.counselorSignedAt;
	if (fields.soldierSigned !== undefined) updates.soldier_signed = fields.soldierSigned;
	if (fields.soldierSignedAt !== undefined) updates.soldier_signed_at = fields.soldierSignedAt;

	const { data, error: dbError } = await supabase
		.from('counseling_records')
		.update(updates)
		.eq('id', id)
		.eq('organization_id', orgId)
		.select()
		.single();

	if (dbError) throw error(500, dbError.message);

	return json({
		id: data.id,
		personnelId: data.personnel_id,
		counselingTypeId: data.counseling_type_id,
		dateConducted: data.date_conducted,
		subject: data.subject,
		keyPoints: data.key_points,
		planOfAction: data.plan_of_action,
		followUpDate: data.follow_up_date,
		status: data.status,
		counselorSigned: data.counselor_signed,
		counselorSignedAt: data.counselor_signed_at,
		soldierSigned: data.soldier_signed,
		soldierSignedAt: data.soldier_signed_at
	});
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
		.from('counseling_records')
		.delete()
		.eq('id', id)
		.eq('organization_id', orgId);

	if (dbError) throw error(500, dbError.message);

	return json({ success: true });
};
