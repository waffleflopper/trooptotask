import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { isBillingEnabled } from '$lib/config/billing';
import { getEffectiveTier, getMonthlyExportCount } from '$lib/server/subscription';
import { TIER_CONFIG } from '$lib/types/subscription';
import { getAdminClient } from '$lib/server/supabase';
import ExcelJS from 'exceljs';
import { auditLog } from '$lib/server/auditLog';

export const POST: RequestHandler = async ({ params, locals }) => {
	const { orgId } = params;

	if (!locals.user) throw error(401, 'Unauthorized');
	const userId = locals.user.id;

	// Only allow org owner or admin to trigger export
	const { data: membership } = await locals.supabase
		.from('organization_memberships')
		.select('role, can_manage_members')
		.eq('organization_id', orgId)
		.eq('user_id', userId)
		.single();

	if (!membership) throw error(403, 'Not a member of this organization');
	if (membership.role !== 'owner' && !membership.can_manage_members) {
		throw error(403, 'Only the organization owner or admin can export data');
	}

	// Check rate limit when billing is enabled
	if (isBillingEnabled) {
		const tier = await getEffectiveTier(locals.supabase, orgId);
		const config = TIER_CONFIG[tier.tier];
		const exportCount = await getMonthlyExportCount(locals.supabase, orgId);
		if (exportCount >= config.bulkExportsPerMonth) {
			return new Response(
				JSON.stringify({
					error: `Export limit reached (${config.bulkExportsPerMonth}/month). Upgrade for unlimited exports.`
				}),
				{ status: 429, headers: { 'Content-Type': 'application/json' } }
			);
		}
	}

	// Record export as processing
	const { data: exportRecord, error: insertError } = await locals.supabase
		.from('data_exports')
		.insert({
			org_id: orgId,
			requested_by: userId,
			status: 'processing'
		})
		.select()
		.single();

	if (insertError) throw error(500, `Failed to create export record: ${insertError.message}`);

	try {
		// Query all org data in parallel
		const [
			personnelRes,
			groupsRes,
			availabilityRes,
			trainingTypesRes,
			personnelTrainingsRes,
			statusTypesRes,
			assignmentTypesRes,
			dailyAssignmentsRes,
			counselingTypesRes,
			counselingRecordsRes,
			specialDaysRes,
			onboardingTemplateRes,
			onboardingsRes,
			ratingSchemeRes,
			developmentGoalsRes,
			personnelExtendedRes
		] = await Promise.all([
			locals.supabase.from('personnel').select('*').eq('organization_id', orgId),
			locals.supabase.from('groups').select('*').eq('organization_id', orgId),
			locals.supabase.from('availability_entries').select('*').eq('organization_id', orgId),
			locals.supabase.from('training_types').select('*').eq('organization_id', orgId),
			locals.supabase.from('personnel_trainings').select('*').eq('organization_id', orgId),
			locals.supabase.from('status_types').select('*').eq('organization_id', orgId),
			locals.supabase.from('assignment_types').select('*').eq('organization_id', orgId),
			locals.supabase.from('daily_assignments').select('*').eq('organization_id', orgId),
			locals.supabase.from('counseling_types').select('*').eq('organization_id', orgId),
			locals.supabase.from('counseling_records').select('*').eq('organization_id', orgId),
			locals.supabase.from('special_days').select('*').eq('organization_id', orgId),
			locals.supabase
				.from('onboarding_template_steps')
				.select('*')
				.eq('organization_id', orgId),
			locals.supabase.from('personnel_onboardings').select('*').eq('organization_id', orgId),
			locals.supabase.from('rating_scheme_entries').select('*').eq('organization_id', orgId),
			locals.supabase.from('development_goals').select('*').eq('organization_id', orgId),
			locals.supabase.from('personnel_extended_info').select('*').eq('organization_id', orgId)
		]);

		// Fetch onboarding step progress
		const onboardingIds = (onboardingsRes.data ?? []).map((o: { id: string }) => o.id);
		const onboardingProgressRes =
			onboardingIds.length > 0
				? await locals.supabase
						.from('onboarding_step_progress')
						.select('*')
						.in('onboarding_id', onboardingIds)
				: { data: [] };

		const personnel = personnelRes.data ?? [];
		const groups = groupsRes.data ?? [];
		const trainingTypes = trainingTypesRes.data ?? [];
		const statusTypes = statusTypesRes.data ?? [];
		const assignmentTypes = assignmentTypesRes.data ?? [];
		const counselingTypes = counselingTypesRes.data ?? [];
		const personnelExtended = personnelExtendedRes.data ?? [];

		// Build lookup maps
		const personnelMap = new Map<string, string>();
		for (const p of personnel) {
			personnelMap.set(p.id, `${p.rank ?? ''} ${p.last_name ?? ''}, ${p.first_name ?? ''}`.trim());
		}

		const groupMap = new Map<string, string>();
		for (const g of groups) {
			groupMap.set(g.id, g.name);
		}

		const trainingTypeMap = new Map<string, string>();
		for (const t of trainingTypes) {
			trainingTypeMap.set(t.id, t.name);
		}

		const statusTypeMap = new Map<string, string>();
		for (const s of statusTypes) {
			statusTypeMap.set(s.id, s.name);
		}

		const assignmentTypeMap = new Map<string, string>();
		for (const a of assignmentTypes) {
			assignmentTypeMap.set(a.id, a.name);
		}

		const counselingTypeMap = new Map<string, string>();
		for (const c of counselingTypes) {
			counselingTypeMap.set(c.id, c.name);
		}

		// Build extended info map keyed by personnel_id
		const extendedMap = new Map<string, Record<string, unknown>>();
		for (const e of personnelExtended) {
			extendedMap.set(e.personnel_id, e);
		}

		// Create workbook
		const workbook = new ExcelJS.Workbook();

		// -- Personnel Sheet --
		const personnelSheet = workbook.addWorksheet('Personnel');
		personnelSheet.columns = [
			{ header: 'Rank', key: 'rank', width: 10 },
			{ header: 'Last Name', key: 'last_name', width: 18 },
			{ header: 'First Name', key: 'first_name', width: 18 },
			{ header: 'MOS', key: 'mos', width: 12 },
			{ header: 'Role', key: 'clinic_role', width: 12 },
			{ header: 'Group', key: 'group', width: 20 },
			{ header: 'Emergency Contact', key: 'emergency_contact', width: 25 },
			{ header: 'Emergency Phone', key: 'emergency_phone', width: 18 },
			{ header: 'Phone', key: 'phone', width: 18 },
			{ header: 'Email', key: 'email', width: 25 },
			{ header: 'Address', key: 'address', width: 35 },
			{ header: 'Leader Notes', key: 'leader_notes', width: 30 }
		];
		for (const p of personnel) {
			const ext = extendedMap.get(p.id) as Record<string, unknown> | undefined;
			const address = ext
				? [ext.address_street, ext.address_city, ext.address_state, ext.address_zip]
						.filter(Boolean)
						.join(', ')
				: '';
			personnelSheet.addRow({
				rank: p.rank,
				last_name: p.last_name,
				first_name: p.first_name,
				mos: p.mos,
				clinic_role: p.clinic_role,
				group: groupMap.get(p.group_id) ?? '',
				emergency_contact: ext?.emergency_contact_name ?? '',
				emergency_phone: ext?.emergency_contact_phone ?? '',
				phone: ext?.personal_phone ?? '',
				email: ext?.personal_email ?? '',
				address,
				leader_notes: ext?.leader_notes ?? ''
			});
		}
		styleHeaderRow(personnelSheet);

		// -- Groups Sheet --
		const groupsSheet = workbook.addWorksheet('Groups');
		groupsSheet.columns = [
			{ header: 'Name', key: 'name', width: 25 },
			{ header: 'Sort Order', key: 'sort_order', width: 12 }
		];
		for (const g of groups) {
			groupsSheet.addRow({ name: g.name, sort_order: g.sort_order });
		}
		styleHeaderRow(groupsSheet);

		// -- Calendar Sheet --
		const calendarSheet = workbook.addWorksheet('Calendar');
		calendarSheet.columns = [
			{ header: 'Person', key: 'person', width: 25 },
			{ header: 'Status', key: 'status', width: 18 },
			{ header: 'Start Date', key: 'start_date', width: 14 },
			{ header: 'End Date', key: 'end_date', width: 14 }
		];
		for (const a of availabilityRes.data ?? []) {
			calendarSheet.addRow({
				person: personnelMap.get(a.personnel_id) ?? a.personnel_id,
				status: statusTypeMap.get(a.status_type_id) ?? a.status_type_id,
				start_date: a.start_date,
				end_date: a.end_date
			});
		}
		styleHeaderRow(calendarSheet);

		// -- Training Types Sheet --
		const trainingTypesSheet = workbook.addWorksheet('Training Types');
		trainingTypesSheet.columns = [
			{ header: 'Name', key: 'name', width: 25 },
			{ header: 'Color', key: 'color', width: 12 },
			{ header: 'Expiration Days', key: 'expiration_days', width: 16 }
		];
		for (const t of trainingTypes) {
			trainingTypesSheet.addRow({
				name: t.name,
				color: t.color,
				expiration_days: t.expiration_days
			});
		}
		styleHeaderRow(trainingTypesSheet);

		// -- Training Records Sheet --
		const trainingRecordsSheet = workbook.addWorksheet('Training Records');
		trainingRecordsSheet.columns = [
			{ header: 'Person', key: 'person', width: 25 },
			{ header: 'Training Type', key: 'training_type', width: 25 },
			{ header: 'Completed Date', key: 'completion_date', width: 16 },
			{ header: 'Expiration Date', key: 'expiration_date', width: 16 },
			{ header: 'Notes', key: 'notes', width: 30 }
		];
		for (const t of personnelTrainingsRes.data ?? []) {
			trainingRecordsSheet.addRow({
				person: personnelMap.get(t.personnel_id) ?? t.personnel_id,
				training_type: trainingTypeMap.get(t.training_type_id) ?? t.training_type_id,
				completion_date: t.completion_date,
				expiration_date: t.expiration_date,
				notes: t.notes
			});
		}
		styleHeaderRow(trainingRecordsSheet);

		// -- Status Types Sheet --
		const statusTypesSheet = workbook.addWorksheet('Status Types');
		statusTypesSheet.columns = [
			{ header: 'Name', key: 'name', width: 25 },
			{ header: 'Color', key: 'color', width: 12 },
			{ header: 'Text Color', key: 'text_color', width: 12 }
		];
		for (const s of statusTypes) {
			statusTypesSheet.addRow({ name: s.name, color: s.color, text_color: s.text_color });
		}
		styleHeaderRow(statusTypesSheet);

		// -- Assignment Types Sheet --
		const assignmentTypesSheet = workbook.addWorksheet('Assignment Types');
		assignmentTypesSheet.columns = [
			{ header: 'Name', key: 'name', width: 25 },
			{ header: 'Color', key: 'color', width: 12 }
		];
		for (const a of assignmentTypes) {
			assignmentTypesSheet.addRow({ name: a.name, color: a.color });
		}
		styleHeaderRow(assignmentTypesSheet);

		// -- Daily Assignments Sheet --
		const dailyAssignmentsSheet = workbook.addWorksheet('Daily Assignments');
		dailyAssignmentsSheet.columns = [
			{ header: 'Date', key: 'date', width: 14 },
			{ header: 'Person', key: 'person', width: 25 },
			{ header: 'Assignment Type', key: 'assignment_type', width: 25 }
		];
		for (const d of dailyAssignmentsRes.data ?? []) {
			dailyAssignmentsSheet.addRow({
				date: d.date,
				person: personnelMap.get(d.assignee_id) ?? d.assignee_id,
				assignment_type: assignmentTypeMap.get(d.assignment_type_id) ?? d.assignment_type_id
			});
		}
		styleHeaderRow(dailyAssignmentsSheet);

		// -- Counseling Types Sheet --
		const counselingTypesSheet = workbook.addWorksheet('Counseling Types');
		counselingTypesSheet.columns = [
			{ header: 'Name', key: 'name', width: 25 },
			{ header: 'Color', key: 'color', width: 12 }
		];
		for (const c of counselingTypes) {
			counselingTypesSheet.addRow({ name: c.name, color: c.color });
		}
		styleHeaderRow(counselingTypesSheet);

		// -- Counseling Records Sheet --
		const counselingRecordsSheet = workbook.addWorksheet('Counseling Records');
		counselingRecordsSheet.columns = [
			{ header: 'Person', key: 'person', width: 25 },
			{ header: 'Type', key: 'type', width: 20 },
			{ header: 'Date', key: 'date_conducted', width: 14 },
			{ header: 'Subject', key: 'subject', width: 35 },
			{ header: 'Key Points', key: 'key_points', width: 40 },
			{ header: 'Plan of Action', key: 'plan_of_action', width: 40 },
			{ header: 'Status', key: 'status', width: 14 },
			{ header: 'Notes', key: 'notes', width: 30 }
		];
		for (const c of counselingRecordsRes.data ?? []) {
			counselingRecordsSheet.addRow({
				person: personnelMap.get(c.personnel_id) ?? c.personnel_id,
				type: counselingTypeMap.get(c.counseling_type_id) ?? c.counseling_type_id,
				date_conducted: c.date_conducted,
				subject: c.subject,
				key_points: c.key_points,
				plan_of_action: c.plan_of_action,
				status: c.status,
				notes: c.notes
			});
		}
		styleHeaderRow(counselingRecordsSheet);

		// -- Special Days Sheet --
		const specialDaysSheet = workbook.addWorksheet('Special Days');
		specialDaysSheet.columns = [
			{ header: 'Date', key: 'date', width: 14 },
			{ header: 'Name', key: 'name', width: 30 },
			{ header: 'Type', key: 'type', width: 14 }
		];
		for (const s of specialDaysRes.data ?? []) {
			specialDaysSheet.addRow({ date: s.date, name: s.name, type: s.type });
		}
		styleHeaderRow(specialDaysSheet);

		// -- Onboarding Templates Sheet --
		const onboardingTemplatesSheet = workbook.addWorksheet('Onboarding Templates');
		onboardingTemplatesSheet.columns = [
			{ header: 'Step Name', key: 'name', width: 30 },
			{ header: 'Description', key: 'description', width: 40 },
			{ header: 'Order', key: 'sort_order', width: 10 }
		];
		for (const s of onboardingTemplateRes.data ?? []) {
			onboardingTemplatesSheet.addRow({
				name: s.name,
				description: s.description,
				sort_order: s.sort_order
			});
		}
		styleHeaderRow(onboardingTemplatesSheet);

		// -- Onboarding Progress Sheet --
		const onboardingProgressSheet = workbook.addWorksheet('Onboarding Progress');
		onboardingProgressSheet.columns = [
			{ header: 'Person', key: 'person', width: 25 },
			{ header: 'Status', key: 'status', width: 14 },
			{ header: 'Started', key: 'started_at', width: 20 },
			{ header: 'Completed', key: 'completed_at', width: 20 }
		];
		for (const o of onboardingsRes.data ?? []) {
			onboardingProgressSheet.addRow({
				person: personnelMap.get(o.personnel_id) ?? o.personnel_id,
				status: o.status,
				started_at: o.started_at,
				completed_at: o.completed_at
			});
		}
		styleHeaderRow(onboardingProgressSheet);

		// -- Rating Scheme Sheet --
		const ratingSchemeSheet = workbook.addWorksheet('Rating Scheme');
		ratingSchemeSheet.columns = [
			{ header: 'Rated Person', key: 'person', width: 25 },
			{ header: 'Eval Type', key: 'eval_type', width: 14 },
			{ header: 'Report Type', key: 'report_type', width: 14 },
			{ header: 'Rater', key: 'rater_name', width: 25 },
			{ header: 'Senior Rater', key: 'senior_rater_name', width: 25 },
			{ header: 'Intermediate Rater', key: 'intermediate_rater_name', width: 25 },
			{ header: 'Reviewer', key: 'reviewer_name', width: 25 },
			{ header: 'Rating Period Start', key: 'rating_period_start', width: 18 },
			{ header: 'Rating Period End', key: 'rating_period_end', width: 18 },
			{ header: 'Status', key: 'status', width: 14 },
			{ header: 'Notes', key: 'notes', width: 30 }
		];
		for (const r of ratingSchemeRes.data ?? []) {
			ratingSchemeSheet.addRow({
				person: personnelMap.get(r.rated_person_id) ?? r.rated_person_id,
				eval_type: r.eval_type,
				report_type: r.report_type,
				rater_name: r.rater_name,
				senior_rater_name: r.senior_rater_name,
				intermediate_rater_name: r.intermediate_rater_name,
				reviewer_name: r.reviewer_name,
				rating_period_start: r.rating_period_start,
				rating_period_end: r.rating_period_end,
				status: r.status,
				notes: r.notes
			});
		}
		styleHeaderRow(ratingSchemeSheet);

		// -- Development Goals Sheet --
		const devGoalsSheet = workbook.addWorksheet('Development Goals');
		devGoalsSheet.columns = [
			{ header: 'Person', key: 'person', width: 25 },
			{ header: 'Title', key: 'title', width: 30 },
			{ header: 'Description', key: 'description', width: 40 },
			{ header: 'Category', key: 'category', width: 14 },
			{ header: 'Priority', key: 'priority', width: 12 },
			{ header: 'Status', key: 'status', width: 14 },
			{ header: 'Target Date', key: 'target_date', width: 14 },
			{ header: 'Progress Notes', key: 'progress_notes', width: 30 }
		];
		for (const d of developmentGoalsRes.data ?? []) {
			devGoalsSheet.addRow({
				person: personnelMap.get(d.personnel_id) ?? d.personnel_id,
				title: d.title,
				description: d.description,
				category: d.category,
				priority: d.priority,
				status: d.status,
				target_date: d.target_date,
				progress_notes: d.progress_notes
			});
		}
		styleHeaderRow(devGoalsSheet);

		// Write workbook to buffer
		const buffer = await workbook.xlsx.writeBuffer();

		// Update export record to completed
		const adminClient = getAdminClient();
		await adminClient
			.from('data_exports')
			.update({
				status: 'completed',
				completed_at: new Date().toISOString(),
				file_size_bytes: (buffer as ArrayBuffer).byteLength
			})
			.eq('id', exportRecord.id);

		auditLog(
			{ action: 'export.excel_created', resourceType: 'data_export', orgId },
			{ userId: locals.user!.id }
		);

		const dateStr = new Date().toISOString().split('T')[0];
		return new Response(buffer as ArrayBuffer, {
			headers: {
				'Content-Type':
					'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
				'Content-Disposition': `attachment; filename="org-export-${orgId}-${dateStr}.xlsx"`
			}
		});
	} catch (err) {
		// Mark export as failed
		const adminClient = getAdminClient();
		await adminClient
			.from('data_exports')
			.update({
				status: 'failed',
				completed_at: new Date().toISOString()
			})
			.eq('id', exportRecord.id);

		console.error('Excel export error:', err);
		throw error(500, 'Failed to generate export');
	}
};

function styleHeaderRow(sheet: ExcelJS.Worksheet) {
	const headerRow = sheet.getRow(1);
	headerRow.font = { bold: true };
	headerRow.eachCell((cell) => {
		cell.fill = {
			type: 'pattern',
			pattern: 'solid',
			fgColor: { argb: 'FFE8E8E8' }
		};
	});
}
