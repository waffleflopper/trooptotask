import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireEditPermission, getScopedGroupId } from '$lib/server/permissions';
import { getApiContext } from '$lib/server/supabase';
import { checkReadOnly } from '$lib/server/read-only-guard';
import { notifyAdmins } from '$lib/server/notifications';

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
		notes: row.notes,
		reportType: row.report_type,
		workflowStatus: row.workflow_status
	};
}

export const POST: RequestHandler = async ({ params, request, locals, cookies }) => {
	const { orgId } = params;
	const { supabase, userId, isSandbox } = getApiContext(locals, cookies, orgId);

	if (!isSandbox) {
		await requireEditPermission(supabase, orgId, userId!, 'personnel');
	}

	const blocked = await checkReadOnly(supabase, orgId);
	if (blocked) return blocked;

	const body = await request.json();

	// Enforce group scoping on the rated person
	if (!isSandbox && userId && body.ratedPersonId) {
		const scopedGroupId = await getScopedGroupId(supabase, orgId, userId);
		if (scopedGroupId) {
			const { data: person } = await supabase
				.from('personnel')
				.select('group_id')
				.eq('id', body.ratedPersonId)
				.single();
			if (person && person.group_id !== scopedGroupId) {
				throw error(403, 'You can only manage rating scheme entries for personnel in your group');
			}
		}
	}

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
		notes: body.notes || null,
		report_type: body.reportType || null,
		workflow_status: body.workflowStatus || null
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

	const blocked = await checkReadOnly(supabase, orgId);
	if (blocked) return blocked;

	const body = await request.json();
	const { id, ...fields } = body;

	if (!id) throw error(400, 'Missing id');

	// Enforce group scoping on the rated person
	if (!isSandbox && userId) {
		const scopedGroupId = await getScopedGroupId(supabase, orgId, userId);
		if (scopedGroupId) {
			const { data: entry } = await supabase
				.from('rating_scheme_entries')
				.select('rated_person_id')
				.eq('id', id)
				.eq('organization_id', orgId)
				.single();
			if (entry) {
				const { data: person } = await supabase
					.from('personnel')
					.select('group_id')
					.eq('id', entry.rated_person_id)
					.single();
				if (person && person.group_id !== scopedGroupId) {
					throw error(403, 'You can only manage rating scheme entries for personnel in your group');
				}
			}
		}
	}

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
	if (fields.reportType !== undefined) updates.report_type = fields.reportType || null;
	if (fields.workflowStatus !== undefined) updates.workflow_status = fields.workflowStatus || null;

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

	const blocked = await checkReadOnly(supabase, orgId);
	if (blocked) return blocked;

	const body = await request.json();
	const { id } = body;

	if (!id) throw error(400, 'Missing id');

	// Enforce group scoping
	if (!isSandbox && userId) {
		const scopedGroupId = await getScopedGroupId(supabase, orgId, userId);
		if (scopedGroupId) {
			const { data: entry } = await supabase
				.from('rating_scheme_entries')
				.select('rated_person_id')
				.eq('id', id)
				.eq('organization_id', orgId)
				.single();
			if (entry) {
				const { data: person } = await supabase
					.from('personnel')
					.select('group_id')
					.eq('id', entry.rated_person_id)
					.single();
				if (person && person.group_id !== scopedGroupId) {
					throw error(403, 'You can only manage rating scheme entries for personnel in your group');
				}
			}
		}
	}

	// Deletion approval for non-full-editors
	if (!isSandbox && userId) {
		const { data: mem } = await supabase
			.from('organization_memberships')
			.select('role, scoped_group_id, can_view_calendar, can_edit_calendar, can_view_personnel, can_edit_personnel, can_view_training, can_edit_training, can_view_onboarding, can_edit_onboarding, can_view_leaders_book, can_edit_leaders_book')
			.eq('organization_id', orgId)
			.eq('user_id', userId)
			.single();

		if (mem && mem.role === 'member') {
			const isFullEd = !mem.scoped_group_id &&
				mem.can_view_calendar && mem.can_edit_calendar &&
				mem.can_view_personnel && mem.can_edit_personnel &&
				mem.can_view_training && mem.can_edit_training &&
				mem.can_view_onboarding && mem.can_edit_onboarding &&
				mem.can_view_leaders_book && mem.can_edit_leaders_book;

			if (!isFullEd) {
				return json({ requiresApproval: true }, { status: 202 });
			}
		}
	}

	// Capture entry details before deletion for notification
	const { data: deletedEntry } = await supabase
		.from('rating_scheme_entries')
		.select('eval_type')
		.eq('id', id)
		.eq('organization_id', orgId)
		.single();
	const deletedName = (deletedEntry as any)?.eval_type;

	const { error: dbError } = await supabase
		.from('rating_scheme_entries')
		.delete()
		.eq('id', id)
		.eq('organization_id', orgId);

	if (dbError) throw error(500, dbError.message);

	await notifyAdmins(orgId, userId, {
		type: 'config_type_deleted',
		title: 'Rating Scheme Entry Deleted',
		message: `"${locals.user?.email}" deleted the rating scheme entry "${deletedName ?? 'unknown'}".`
	});

	return json({ success: true });
};
