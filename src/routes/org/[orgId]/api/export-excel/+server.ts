import type { RequestEvent } from '@sveltejs/kit';
import { handle, type RouteConfig } from '$lib/server/adapters/httpAdapter';
import { fail } from '$lib/server/core/errors';
import { isBillingEnabled } from '$lib/config/billing';
import { TIER_CONFIG } from '$lib/types/subscription';
import ExcelJS from 'exceljs';
import { completeDataExport, failDataExport, startDataExport } from '$lib/server/core/useCases/dataExportLifecycle';

interface ExcelExportInput {
	email: string | undefined;
}

interface ExcelExportOutput {
	_rateLimited?: boolean;
	error?: string;
	_buffer?: ArrayBuffer;
	_filename?: string;
}

export const _postConfig: RouteConfig<ExcelExportInput, ExcelExportOutput> = {
	permission: 'manageMembers',
	mutation: true,
	parseInput: (event: RequestEvent) => ({
		email: event.locals.user?.email
	}),
	fn: async (ctx, input) => {
		const orgId = ctx.auth.orgId;
		const userId = ctx.auth.userId;

		if (!userId) fail(403, 'Authenticated user required');

		if (isBillingEnabled) {
			const tier = await ctx.subscription.getEffectiveTier();
			const config = TIER_CONFIG[tier.tier];
			const exportCount = await ctx.subscription.getMonthlyExportCount();
			if (exportCount >= config.bulkExportsPerMonth) {
				return {
					_rateLimited: true,
					error: `Export limit reached (${config.bulkExportsPerMonth}/month). Upgrade for unlimited exports.`
				};
			}
		}

		const exportRecord = await startDataExport({ auth: ctx.auth, store: ctx.rawStore }, { requestedBy: userId });

		try {
			const [
				personnel,
				groups,
				availabilityEntries,
				trainingTypes,
				personnelTrainings,
				statusTypes,
				assignmentTypes,
				dailyAssignments,
				counselingRecords,
				specialDays,
				onboardingTemplateSteps,
				personnelOnboardings,
				ratingSchemeEntries,
				personnelExtendedInfo,
				leaderNotes,
				personnelFollowUps,
				personnelDocuments
			] = await Promise.all([
				ctx.rawStore.findMany<Record<string, unknown>>('personnel', orgId, undefined, {
					isNull: { archived_at: true }
				}),
				ctx.rawStore.findMany<Record<string, unknown>>('groups', orgId),
				ctx.rawStore.findMany<Record<string, unknown>>('availability_entries', orgId),
				ctx.rawStore.findMany<Record<string, unknown>>('training_types', orgId),
				ctx.rawStore.findMany<Record<string, unknown>>('personnel_trainings', orgId),
				ctx.rawStore.findMany<Record<string, unknown>>('status_types', orgId),
				ctx.rawStore.findMany<Record<string, unknown>>('assignment_types', orgId),
				ctx.rawStore.findMany<Record<string, unknown>>('daily_assignments', orgId),
				ctx.rawStore.findMany<Record<string, unknown>>('counseling_records', orgId),
				ctx.rawStore.findMany<Record<string, unknown>>('special_days', orgId),
				ctx.rawStore.findMany<Record<string, unknown>>('onboarding_template_steps', orgId),
				ctx.rawStore.findMany<Record<string, unknown>>('personnel_onboardings', orgId),
				ctx.rawStore.findMany<Record<string, unknown>>('rating_scheme_entries', orgId),
				ctx.rawStore.findMany<Record<string, unknown>>('personnel_extended_info', orgId),
				ctx.rawStore.findMany<Record<string, unknown>>('leader_notes', orgId),
				ctx.rawStore.findMany<Record<string, unknown>>('personnel_follow_ups', orgId),
				ctx.rawStore.findMany<Record<string, unknown>>('personnel_documents', orgId)
			]);

			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const personnelRows = personnel as any[];

			const personnelMap = new Map<string, string>();
			for (const p of personnelRows)
				personnelMap.set(p.id, `${p.rank ?? ''} ${p.last_name ?? ''}, ${p.first_name ?? ''}`.trim());
			const groupMap = new Map<string, string>();
			for (const g of groups as { id: string; name: string }[]) groupMap.set(g.id, g.name);
			const trainingTypeMap = new Map<string, string>();
			for (const t of trainingTypes as { id: string; name: string }[]) trainingTypeMap.set(t.id, t.name);
			const statusTypeMap = new Map<string, string>();
			for (const s of statusTypes as { id: string; name: string }[]) statusTypeMap.set(s.id, s.name);
			const assignmentTypeMap = new Map<string, string>();
			for (const a of assignmentTypes as { id: string; name: string }[]) assignmentTypeMap.set(a.id, a.name);
			const extendedMap = new Map<string, Record<string, unknown>>();
			for (const e of personnelExtendedInfo as (Record<string, unknown> & {
				personnel_id: string;
			})[])
				extendedMap.set(e.personnel_id, e);

			const workbook = new ExcelJS.Workbook();

			const personnelSheet = workbook.addWorksheet('Personnel');
			personnelSheet.columns = [
				{ header: 'Rank', key: 'rank', width: 10 },
				{ header: 'Last Name', key: 'last_name', width: 18 },
				{ header: 'First Name', key: 'first_name', width: 18 },
				{ header: 'MOS', key: 'mos', width: 12 },
				{ header: 'Duty Role', key: 'clinic_role', width: 12 },
				{ header: 'Group', key: 'group', width: 20 },
				{ header: 'ETS', key: 'ets', width: 14 },
				{ header: 'PCS / DEROS', key: 'deros', width: 14 },
				{ header: 'Emergency Contact', key: 'emergency_contact', width: 25 },
				{ header: 'Emergency Phone', key: 'emergency_phone', width: 18 },
				{ header: 'Phone', key: 'phone', width: 18 },
				{ header: 'Email', key: 'email', width: 25 },
				{ header: 'Address', key: 'address', width: 35 },
				{ header: 'Leader Notes', key: 'leader_notes', width: 30 }
			];
			for (const p of personnelRows) {
				const ext = extendedMap.get(p.id) as Record<string, unknown> | undefined;
				personnelSheet.addRow({
					rank: p.rank,
					last_name: p.last_name,
					first_name: p.first_name,
					mos: p.mos,
					clinic_role: p.clinic_role,
					group: groupMap.get(p.group_id) ?? '',
					ets: p.ets ?? '',
					deros: p.deros ?? '',
					emergency_contact: ext?.emergency_contact_name ?? '',
					emergency_phone: ext?.emergency_contact_phone ?? '',
					phone: ext?.personal_phone ?? '',
					email: ext?.personal_email ?? '',
					address: ext
						? [ext.address_street, ext.address_city, ext.address_state, ext.address_zip].filter(Boolean).join(', ')
						: '',
					leader_notes: ext?.leader_notes ?? ''
				});
			}
			styleHeaderRow(personnelSheet);

			addSimpleSheet(
				workbook,
				'Groups',
				[
					{ header: 'Name', key: 'name', width: 25 },
					{ header: 'Sort Order', key: 'sort_order', width: 12 }
				],
				groups
			);
			addMappedSheet(
				workbook,
				'Calendar',
				availabilityEntries,
				[
					{ header: 'Person', key: 'person', width: 25 },
					{ header: 'Status', key: 'status', width: 18 },
					{ header: 'Start Date', key: 'start_date', width: 14 },
					{ header: 'End Date', key: 'end_date', width: 14 }
				],
				(a) => ({
					person: personnelMap.get(a.personnel_id) ?? a.personnel_id,
					status: statusTypeMap.get(a.status_type_id) ?? a.status_type_id,
					start_date: a.start_date,
					end_date: a.end_date
				})
			);
			addSimpleSheet(
				workbook,
				'Training Types',
				[
					{ header: 'Name', key: 'name', width: 25 },
					{ header: 'Color', key: 'color', width: 12 },
					{ header: 'Expiration Days', key: 'expiration_days', width: 16 }
				],
				trainingTypes
			);
			addMappedSheet(
				workbook,
				'Training Records',
				personnelTrainings,
				[
					{ header: 'Person', key: 'person', width: 25 },
					{ header: 'Training Type', key: 'training_type', width: 25 },
					{ header: 'Completed Date', key: 'completion_date', width: 16 },
					{ header: 'Expiration Date', key: 'expiration_date', width: 16 },
					{ header: 'Notes', key: 'notes', width: 30 }
				],
				(t) => ({
					person: personnelMap.get(t.personnel_id) ?? t.personnel_id,
					training_type: trainingTypeMap.get(t.training_type_id) ?? t.training_type_id,
					completion_date: t.completion_date,
					expiration_date: t.expiration_date,
					notes: t.notes
				})
			);
			addSimpleSheet(
				workbook,
				'Status Types',
				[
					{ header: 'Name', key: 'name', width: 25 },
					{ header: 'Color', key: 'color', width: 12 },
					{ header: 'Text Color', key: 'text_color', width: 12 }
				],
				statusTypes
			);
			addSimpleSheet(
				workbook,
				'Assignment Types',
				[
					{ header: 'Name', key: 'name', width: 25 },
					{ header: 'Color', key: 'color', width: 12 }
				],
				assignmentTypes
			);
			addMappedSheet(
				workbook,
				'Daily Assignments',
				dailyAssignments,
				[
					{ header: 'Date', key: 'date', width: 14 },
					{ header: 'Person', key: 'person', width: 25 },
					{ header: 'Assignment Type', key: 'assignment_type', width: 25 }
				],
				(d) => ({
					date: d.date,
					person: personnelMap.get(d.assignee_id) ?? d.assignee_id,
					assignment_type: assignmentTypeMap.get(d.assignment_type_id) ?? d.assignment_type_id
				})
			);
			addMappedSheet(
				workbook,
				'Counseling Records',
				counselingRecords,
				[
					{ header: 'Person', key: 'person', width: 25 },
					{ header: 'Date', key: 'date_conducted', width: 14 },
					{ header: 'Subject', key: 'subject', width: 35 },
					{ header: 'Key Points', key: 'key_points', width: 40 },
					{ header: 'Plan of Action', key: 'plan_of_action', width: 40 },
					{ header: 'Status', key: 'status', width: 14 },
					{ header: 'Notes', key: 'notes', width: 30 }
				],
				(c) => ({
					person: personnelMap.get(c.personnel_id) ?? c.personnel_id,
					date_conducted: c.date_conducted,
					subject: c.subject,
					key_points: c.key_points,
					plan_of_action: c.plan_of_action,
					status: c.status,
					notes: c.notes
				})
			);
			addMappedSheet(
				workbook,
				'Leader Notes',
				leaderNotes,
				[
					{ header: 'Person', key: 'person', width: 25 },
					{ header: 'Author', key: 'author', width: 25 },
					{ header: 'Note', key: 'text', width: 45 },
					{ header: 'Created At', key: 'created_at', width: 20 },
					{ header: 'Archived At', key: 'archived_at', width: 20 }
				],
				(note) => ({
					person: personnelMap.get(note.personnel_id) ?? note.personnel_id,
					author: note.author,
					text: note.text,
					created_at: note.created_at,
					archived_at: note.archived_at
				})
			);
			addMappedSheet(
				workbook,
				'Personnel Follow-ups',
				personnelFollowUps,
				[
					{ header: 'Person', key: 'person', width: 25 },
					{ header: 'Title', key: 'title', width: 35 },
					{ header: 'Notes', key: 'notes', width: 40 },
					{ header: 'Due Date', key: 'due_date', width: 14 },
					{ header: 'Status', key: 'status', width: 14 },
					{ header: 'Created At', key: 'created_at', width: 20 },
					{ header: 'Completed At', key: 'completed_at', width: 20 },
					{ header: 'Archived At', key: 'archived_at', width: 20 }
				],
				(followUp) => ({
					person: personnelMap.get(followUp.personnel_id) ?? followUp.personnel_id,
					title: followUp.title,
					notes: followUp.notes,
					due_date: followUp.due_date,
					status: followUp.status,
					created_at: followUp.created_at,
					completed_at: followUp.completed_at,
					archived_at: followUp.archived_at
				})
			);
			addMappedSheet(
				workbook,
				'Personnel Documents',
				personnelDocuments,
				[
					{ header: 'Person', key: 'person', width: 25 },
					{ header: 'Title', key: 'title', width: 35 },
					{ header: 'File Name', key: 'file_name', width: 35 },
					{ header: 'File Size Bytes', key: 'file_size_bytes', width: 18 },
					{ header: 'Content Type', key: 'content_type', width: 18 },
					{ header: 'Uploaded By', key: 'uploaded_by', width: 25 },
					{ header: 'Created At', key: 'created_at', width: 20 },
					{ header: 'Archived At', key: 'archived_at', width: 20 }
				],
				(document) => ({
					person: personnelMap.get(document.personnel_id) ?? document.personnel_id,
					title: document.title,
					file_name:
						String(document.file_path ?? '')
							.split(/[\\/]/)
							.pop() ?? '',
					file_size_bytes: document.file_size_bytes,
					content_type: document.content_type,
					uploaded_by: document.uploaded_by,
					created_at: document.created_at,
					archived_at: document.archived_at
				})
			);
			addSimpleSheet(
				workbook,
				'Special Days',
				[
					{ header: 'Date', key: 'date', width: 14 },
					{ header: 'Name', key: 'name', width: 30 },
					{ header: 'Type', key: 'type', width: 14 }
				],
				specialDays
			);
			addSimpleSheet(
				workbook,
				'Onboarding Templates',
				[
					{ header: 'Step Name', key: 'name', width: 30 },
					{ header: 'Description', key: 'description', width: 40 },
					{ header: 'Order', key: 'sort_order', width: 10 }
				],
				onboardingTemplateSteps
			);
			addMappedSheet(
				workbook,
				'Onboarding Progress',
				personnelOnboardings,
				[
					{ header: 'Person', key: 'person', width: 25 },
					{ header: 'Status', key: 'status', width: 14 },
					{ header: 'Started', key: 'started_at', width: 20 },
					{ header: 'Completed', key: 'completed_at', width: 20 }
				],
				(o) => ({
					person: personnelMap.get(o.personnel_id) ?? o.personnel_id,
					status: o.status,
					started_at: o.started_at,
					completed_at: o.completed_at
				})
			);
			addMappedSheet(
				workbook,
				'Rating Scheme',
				ratingSchemeEntries,
				[
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
				],
				(r) => ({
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
				})
			);
			const buffer = await workbook.xlsx.writeBuffer();

			await completeDataExport(
				{ auth: ctx.auth, store: ctx.rawStore },
				{
					exportId: exportRecord.exportId,
					fileSizeBytes: (buffer as ArrayBuffer).byteLength
				}
			);

			ctx.audit.log({ action: 'export.excel_created', resourceType: 'data_export' });

			await ctx.notifications.notifyAdmins(orgId, userId, {
				type: 'bulk_data_exported',
				title: 'Data Exported',
				message: `"${input.email ?? 'A user'}" exported organization data.`
			});

			const dateStr = new Date().toISOString().split('T')[0];
			return { _buffer: buffer as ArrayBuffer, _filename: `org-export-${orgId}-${dateStr}.xlsx` };
		} catch (err) {
			await failDataExport({ auth: ctx.auth, store: ctx.rawStore }, { exportId: exportRecord.exportId });
			throw err;
		}
	},
	formatOutput: (result) => {
		if (result._rateLimited) {
			return new Response(JSON.stringify({ error: result.error }), {
				status: 429,
				headers: { 'Content-Type': 'application/json' }
			});
		}
		return new Response(result._buffer as ArrayBuffer, {
			headers: {
				'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
				'Content-Disposition': `attachment; filename="${result._filename}"`
			}
		});
	}
};

export const POST = handle(_postConfig);

function styleHeaderRow(sheet: ExcelJS.Worksheet) {
	const headerRow = sheet.getRow(1);
	headerRow.font = { bold: true };
	headerRow.eachCell((cell) => {
		cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8E8E8' } };
	});
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function addSimpleSheet(workbook: ExcelJS.Workbook, name: string, columns: any[], data: any[]) {
	const sheet = workbook.addWorksheet(name);
	sheet.columns = columns;
	for (const row of data) sheet.addRow(row);
	styleHeaderRow(sheet);
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function addMappedSheet(
	workbook: ExcelJS.Workbook,
	name: string,
	data: any[],
	columns: any[],
	mapper: (row: any) => any
) {
	/* eslint-enable @typescript-eslint/no-explicit-any */
	const sheet = workbook.addWorksheet(name);
	sheet.columns = columns;
	for (const row of data) sheet.addRow(mapper(row));
	styleHeaderRow(sheet);
}
