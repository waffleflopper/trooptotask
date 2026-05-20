import type { RequestEvent } from '@sveltejs/kit';
import { handle, type RouteConfig } from '$lib/server/adapters/httpAdapter';
import { fail } from '$lib/server/core/errors';
import { isBillingEnabled } from '$lib/config/billing';
import { TIER_CONFIG } from '$lib/types/subscription';
import { completeDataExport, failDataExport, startDataExport } from '$lib/server/core/useCases/dataExportLifecycle';
import {
	ORGANIZATION_EXPORT_SECTIONS,
	loadOrganizationExportPayload
} from '$lib/server/core/useCases/organizationExport';
import {
	addTableSheet,
	createWorkbook,
	workbookBufferResponse,
	writeWorkbookBuffer,
	type Workbook,
	type WorkbookColumn,
	type WorkbookRow
} from '$lib/export/workbook';

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
			const exportData = await loadOrganizationExportPayload(ctx.rawStore, orgId);
			const workbook = await createWorkbook();

			addTableSheet(workbook, {
				name: 'Export Inventory',
				columns: [
					{ header: 'Area', key: 'area', width: 22 },
					{ header: 'Section', key: 'title', width: 34 },
					{ header: 'Raw Table', key: 'table', width: 38 },
					{ header: 'JSON Key', key: 'key', width: 34 },
					{ header: 'Rows', key: 'rowCount', width: 10 }
				],
				rows: toWorkbookRows(exportData.sectionInventory.map((section) => ({ ...section })))
			});

			const sheetNames = new Set<string>(['Export Inventory']);
			addReadableSheets(workbook, sheetNames, exportData.sections);
			for (const section of ORGANIZATION_EXPORT_SECTIONS) {
				addSectionSheet(workbook, sheetNames, `Raw - ${section.title}`, exportData.sections[section.key] ?? []);
			}
			const buffer = await writeWorkbookBuffer(workbook);

			await completeDataExport(
				{ auth: ctx.auth, store: ctx.rawStore },
				{
					exportId: exportRecord.exportId,
					fileSizeBytes: buffer.byteLength
				}
			);

			ctx.audit.log({ action: 'export.excel_created', resourceType: 'data_export' });

			await ctx.notifications.notifyAdmins(orgId, userId, {
				type: 'bulk_data_exported',
				title: 'Data Exported',
				message: `"${input.email ?? 'A user'}" exported organization data.`
			});

			const dateStr = new Date().toISOString().split('T')[0];
			return { _buffer: buffer, _filename: `org-export-${orgId}-${dateStr}.xlsx` };
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
		return workbookBufferResponse(result._buffer as ArrayBuffer, result._filename as string);
	}
};

export const POST = handle(_postConfig);

function addReadableSheets(
	workbook: Workbook,
	sheetNames: Set<string>,
	sections: Record<string, Record<string, unknown>[]>
) {
	const personnel = sections.personnel ?? [];
	const personnelExtendedInfo = sections.personnelExtendedInfo ?? [];
	const groups = sections.groups ?? [];
	const statusTypes = sections.statusTypes ?? [];
	const assignmentTypes = sections.assignmentTypes ?? [];
	const trainingTypes = sections.trainingTypes ?? [];
	const ictTasks = sections.ictTasks ?? [];

	const personnelLabels = buildPersonnelLabels(personnel);
	const groupLabels = buildLabelMap(groups, 'name');
	const statusLabels = buildLabelMap(statusTypes, 'name');
	const assignmentLabels = buildLabelMap(assignmentTypes, 'name');
	const trainingLabels = buildLabelMap(trainingTypes, 'name');
	const criticalTaskLabels = buildLabelMap(ictTasks, 'title');
	const extendedInfoByPerson = new Map(
		personnelExtendedInfo
			.filter((row) => typeof row.personnel_id === 'string')
			.map((row) => [row.personnel_id as string, row])
	);

	addSectionSheet(
		workbook,
		sheetNames,
		'Personnel',
		personnel.map((person) => {
			const ext = typeof person.id === 'string' ? extendedInfoByPerson.get(person.id) : undefined;
			return {
				rank: person.rank,
				last_name: person.last_name,
				first_name: person.first_name,
				mos: person.mos,
				clinic_role: person.clinic_role,
				group: lookup(groupLabels, person.group_id),
				ets: person.ets ?? '',
				deros: person.deros ?? '',
				archived_at: person.archived_at ?? '',
				emergency_contact: ext?.emergency_contact_name ?? '',
				emergency_phone: ext?.emergency_contact_phone ?? '',
				phone: ext?.personal_phone ?? '',
				email: ext?.personal_email ?? '',
				address: ext
					? [ext.address_street, ext.address_city, ext.address_state, ext.address_zip].filter(Boolean).join(', ')
					: '',
				leader_notes: ext?.leader_notes ?? ''
			};
		})
	);
	addSectionSheet(workbook, sheetNames, 'Groups', groups);
	addSectionSheet(
		workbook,
		sheetNames,
		'Calendar',
		(sections.availabilityEntries ?? []).map((entry) => ({
			person: lookup(personnelLabels, entry.personnel_id),
			status: lookup(statusLabels, entry.status_type_id),
			start_date: entry.start_date,
			end_date: entry.end_date,
			note: entry.note ?? ''
		}))
	);
	addSectionSheet(workbook, sheetNames, 'Training Types', trainingTypes);
	addSectionSheet(
		workbook,
		sheetNames,
		'Training Records',
		(sections.personnelTrainings ?? []).map((training) => ({
			person: lookup(personnelLabels, training.personnel_id),
			training_type: lookup(trainingLabels, training.training_type_id),
			completion_date: training.completion_date,
			expiration_date: training.expiration_date,
			notes: training.notes,
			certificate_url: training.certificate_url
		}))
	);
	addSectionSheet(workbook, sheetNames, 'Status Types', statusTypes);
	addSectionSheet(workbook, sheetNames, 'Assignment Types', assignmentTypes);
	addSectionSheet(
		workbook,
		sheetNames,
		'Daily Assignments',
		(sections.dailyAssignments ?? []).map((assignment) => ({
			date: assignment.date,
			person: lookup(personnelLabels, assignment.assignee_id),
			assignment_type: lookup(assignmentLabels, assignment.assignment_type_id)
		}))
	);
	addSectionSheet(
		workbook,
		sheetNames,
		'Counseling Records',
		(sections.counselingRecords ?? []).map((record) => ({
			person: lookup(personnelLabels, record.personnel_id),
			date_conducted: record.date_conducted,
			subject: record.subject,
			key_points: record.key_points,
			plan_of_action: record.plan_of_action,
			status: record.status,
			notes: record.notes
		}))
	);
	addSectionSheet(
		workbook,
		sheetNames,
		'Leader Notes',
		(sections.leaderNotes ?? []).map((note) => ({
			person: lookup(personnelLabels, note.personnel_id),
			author: note.author,
			text: note.text,
			created_at: note.created_at,
			archived_at: note.archived_at
		}))
	);
	addSectionSheet(
		workbook,
		sheetNames,
		'Personnel Follow-ups',
		(sections.personnelFollowUps ?? []).map((followUp) => ({
			person: lookup(personnelLabels, followUp.personnel_id),
			title: followUp.title,
			notes: followUp.notes,
			due_date: followUp.due_date,
			status: followUp.status,
			created_at: followUp.created_at,
			completed_at: followUp.completed_at,
			archived_at: followUp.archived_at
		}))
	);
	addSectionSheet(
		workbook,
		sheetNames,
		'Personnel Documents',
		(sections.personnelDocuments ?? []).map((document) => ({
			person: lookup(personnelLabels, document.personnel_id),
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
		}))
	);
	addSectionSheet(workbook, sheetNames, 'Special Days', sections.specialDays ?? []);
	addSectionSheet(workbook, sheetNames, 'Onboarding Templates', sections.onboardingTemplates ?? []);
	addSectionSheet(
		workbook,
		sheetNames,
		'Onboarding Progress',
		(sections.personnelOnboardings ?? []).map((onboarding) => ({
			person: lookup(personnelLabels, onboarding.personnel_id),
			status: onboarding.status,
			started_at: onboarding.started_at,
			completed_at: onboarding.completed_at,
			cancelled_at: onboarding.cancelled_at
		}))
	);
	addSectionSheet(
		workbook,
		sheetNames,
		'Rating Scheme',
		(sections.ratingSchemeEntries ?? []).map((entry) => ({
			person: lookup(personnelLabels, entry.rated_person_id),
			eval_type: entry.eval_type,
			report_type: entry.report_type,
			rater: lookup(personnelLabels, entry.rater_person_id) || entry.rater_name,
			senior_rater: lookup(personnelLabels, entry.senior_rater_person_id) || entry.senior_rater_name,
			intermediate_rater: lookup(personnelLabels, entry.intermediate_rater_person_id) || entry.intermediate_rater_name,
			reviewer: lookup(personnelLabels, entry.reviewer_person_id) || entry.reviewer_name,
			rating_period_start: entry.rating_period_start,
			rating_period_end: entry.rating_period_end,
			status: entry.status,
			workflow_status: entry.workflow_status,
			notes: entry.notes
		}))
	);
	addSectionSheet(workbook, sheetNames, 'Critical Tasks', ictTasks);
	addSectionSheet(
		workbook,
		sheetNames,
		'Critical Task Completions',
		(sections.personnelIctCompletions ?? []).map((completion) => ({
			person: lookup(personnelLabels, completion.personnel_id),
			task: lookup(criticalTaskLabels, completion.ict_task_id),
			completed_at: completion.completed_at,
			validation_method: completion.validation_method,
			validated_by: completion.validated_by,
			notes: completion.notes
		}))
	);
	addSectionSheet(workbook, sheetNames, 'Duty Roster Templates', sections.dutyRosterTemplates ?? []);
	addSectionSheet(workbook, sheetNames, 'Duty Roster Template Runs', sections.dutyRosterTemplateRuns ?? []);
	addSectionSheet(
		workbook,
		sheetNames,
		'Duty Roster Template Run Corrections',
		sections.dutyRosterTemplateRunCorrections ?? []
	);
}

function buildPersonnelLabels(rows: Record<string, unknown>[]): Map<string, string> {
	const labels = new Map<string, string>();
	for (const row of rows) {
		if (typeof row.id !== 'string') continue;
		const label = [row.rank, `${row.last_name ?? ''},`, row.first_name].filter(Boolean).join(' ').trim();
		labels.set(row.id, label || row.id);
	}
	return labels;
}

function buildLabelMap(rows: Record<string, unknown>[], labelKey: string): Map<string, string> {
	const labels = new Map<string, string>();
	for (const row of rows) {
		if (typeof row.id === 'string' && typeof row[labelKey] === 'string') {
			labels.set(row.id, row[labelKey]);
		}
	}
	return labels;
}

function lookup(labels: Map<string, string>, value: unknown): string {
	const key = typeof value === 'string' ? value : String(value ?? '');
	return labels.get(key) ?? key;
}

function addSectionSheet(workbook: Workbook, sheetNames: Set<string>, title: string, rows: Record<string, unknown>[]) {
	const columns = buildColumns(rows);
	addTableSheet(workbook, {
		name: toWorksheetName(title, sheetNames),
		columns,
		rows: rows.length > 0 ? toWorkbookRows(rows) : []
	});
}

function buildColumns(rows: Record<string, unknown>[]): WorkbookColumn[] {
	const keys = [...new Set(rows.flatMap((row) => Object.keys(row)))];
	if (keys.length === 0) return [{ header: 'No records', key: 'empty', width: 16 }];
	return keys.map((key) => ({
		header: toColumnHeader(key),
		key,
		width: Math.min(Math.max(key.length + 4, 12), 40)
	}));
}

function toColumnHeader(key: string): string {
	if (key === 'clinic_role') return 'Duty Role';
	if (key === 'deros') return 'PCS / DEROS';
	if (key === 'ets') return 'ETS';
	return key
		.replace(/_/g, ' ')
		.replace(/([a-z])([A-Z])/g, '$1 $2')
		.replace(/\b\w/g, (char) => char.toUpperCase());
}

function toWorksheetName(name: string, sheetNames: Set<string>): string {
	const base = name.replace(/[\\/*?:[\]]/g, ' ').slice(0, 31) || 'Sheet';
	let candidate = base;
	let counter = 2;
	while (sheetNames.has(candidate)) {
		const suffix = ` ${counter}`;
		candidate = `${base.slice(0, 31 - suffix.length)}${suffix}`;
		counter += 1;
	}
	sheetNames.add(candidate);
	return candidate;
}

function toWorkbookRows(rows: Record<string, unknown>[]): WorkbookRow[] {
	return rows.map((row) => Object.fromEntries(Object.entries(row).map(([key, value]) => [key, toWorkbookCell(value)])));
}

function toWorkbookCell(value: unknown): WorkbookRow[string] {
	if (
		value === null ||
		value === undefined ||
		typeof value === 'string' ||
		typeof value === 'number' ||
		typeof value === 'boolean' ||
		value instanceof Date
	) {
		return value;
	}
	return String(value);
}
