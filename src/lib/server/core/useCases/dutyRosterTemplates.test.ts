import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuditPort, AuthContext, DataStore, ReadOnlyGuard } from '$lib/server/core/ports';
import {
	acceptDutyRosterTemplatePreview,
	applyDutyRosterTemplatePreviewManualSelection,
	createDutyRosterTemplate,
	findDutyRosterTemplateBySlug,
	generateDutyRosterTemplatePreview,
	listAcceptedDutyRosterTemplateRuns,
	listDutyRosterTemplates,
	loadDutyRosterTemplateSettings,
	updateDutyRosterTemplateSettings
} from './dutyRosterTemplates';

const rows: Record<string, unknown>[] = [];
const acceptedRunRows: Record<string, unknown>[] = [];
const personnelRows: Record<string, unknown>[] = [];
const availabilityRows: Record<string, unknown>[] = [];
const specialDayRows: Record<string, unknown>[] = [];
const statusTypeRows: Record<string, unknown>[] = [];
const auditEvents: Array<{ action: string; resourceType: string; resourceId?: string }> = [];

function createAuth(overrides: Partial<AuthContext> = {}): AuthContext {
	return {
		userId: 'user-1',
		orgId: 'org-1',
		role: 'member',
		isPrivileged: false,
		capabilityMap: {
			calendar: 'operate',
			personnel: 'none',
			training: 'none',
			criticalTasks: 'none',
			onboarding: 'none',
			ratingScheme: 'none'
		},
		compatibilityLanes: { leadersBook: 'none' },
		scopeSet: { kind: 'groups', groupIds: ['group-1'] },
		requireView: vi.fn(),
		requirePrivileged: vi.fn(),
		requireOwner: vi.fn(),
		requireManageMembers: vi.fn(),
		requireGroupAccess: vi.fn(),
		requireGroupAccessBatch: vi.fn(),
		requireGroupAccessByRecord: vi.fn(),
		...overrides
	};
}

const store: DataStore = {
	async findOne(table, orgId, filters) {
		const source = tableRows(table);
		return (
			source.find((row) =>
				Object.entries({ organization_id: orgId, ...filters }).every(([key, value]) => row[key] === value)
			) ?? null
		);
	},
	async findMany(table, orgId, filters = {}, options) {
		const source = tableRows(table);
		let result = source.filter((row) =>
			Object.entries({ organization_id: orgId, ...filters }).every(([key, value]) => row[key] === value)
		);

		if (options?.isNull) {
			result = result.filter((row) =>
				Object.entries(options.isNull ?? {}).every(([key, shouldBeNull]) =>
					shouldBeNull ? row[key] === null || row[key] === undefined : row[key] !== null && row[key] !== undefined
				)
			);
		}

		if (options?.rangeFilters) {
			result = result.filter((row) =>
				options.rangeFilters?.every(({ column, op, value }) => {
					const rowValue = String(row[column] ?? '');
					switch (op) {
						case 'gte':
							return rowValue >= value;
						case 'lte':
							return rowValue <= value;
						case 'gt':
							return rowValue > value;
						case 'lt':
							return rowValue < value;
					}
				})
			);
		}

		if (options?.select === 'slug') {
			return result.map((row) => ({ slug: row.slug }));
		}

		for (const order of options?.orderBy ?? []) {
			result = [...result].sort((a, b) => {
				const comparison = String(a[order.column] ?? '').localeCompare(String(b[order.column] ?? ''));
				return order.ascending ? comparison : -comparison;
			});
		}

		if (typeof options?.limit === 'number') {
			result = result.slice(0, options.limit);
		}

		return result;
	},
	async insert(table, orgId, data) {
		if (table === 'personnel') {
			const row = { id: `person-${personnelRows.length + 1}`, organization_id: orgId, ...data };
			personnelRows.push(row);
			return row;
		}

		if (table === 'duty_roster_template_runs') {
			const row = {
				id: `run-${acceptedRunRows.length + 1}`,
				organization_id: orgId,
				...data
			};
			acceptedRunRows.push(row);
			return row;
		}

		if (
			table === 'duty_roster_templates' &&
			rows.some((row) => row.organization_id === orgId && row.slug === data.slug)
		) {
			throw new Error('duplicate key value violates unique constraint "duty_roster_templates_org_slug_key"');
		}

		const row = {
			id: `template-${rows.length + 1}`,
			organization_id: orgId,
			...data
		};
		rows.push(row);
		return row;
	},
	async update(table, orgId, id, data) {
		const source = tableRows(table);
		const index = source.findIndex((row) => row.organization_id === orgId && row.id === id);
		if (index === -1) {
			throw new Error('row not found');
		}

		source[index] = { ...source[index], ...data };
		return source[index];
	},
	updateById: vi.fn(),
	delete: vi.fn(),
	deleteWhere: vi.fn(),
	deleteWhereAny: vi.fn(),
	deleteManyByIds: vi.fn(),
	insertMany: vi.fn(),
	findManyWithCount: vi.fn()
} as DataStore;

const audit: AuditPort = {
	log: (event) => {
		auditEvents.push(event);
	}
};

const criticalTasksReadModel = {
	findLatestCompletions: vi.fn(),
	findCompletionTrend: vi.fn()
};

const readOnlyGuard: ReadOnlyGuard = {
	check: vi.fn(async () => false)
};

function createCtx(auth = createAuth()) {
	return { auth, store, rawStore: store, audit, readOnlyGuard, criticalTasksReadModel };
}

describe('Duty Roster Template use cases', () => {
	beforeEach(() => {
		rows.length = 0;
		acceptedRunRows.length = 0;
		personnelRows.length = 0;
		availabilityRows.length = 0;
		specialDayRows.length = 0;
		statusTypeRows.length = 0;
		auditEvents.length = 0;
		vi.mocked(readOnlyGuard.check).mockResolvedValue(false);
	});

	it('allows a scoped Calendar operator to create one-duty templates', async () => {
		const template = await createDutyRosterTemplate(createCtx(), { name: 'CQ NCO', shortCode: 'cq' });

		expect(template).toMatchObject({
			id: 'template-1',
			name: 'CQ NCO',
			slug: 'cq-nco',
			shortCode: 'CQ',
			status: 'active'
		});
		expect(auditEvents).toContainEqual({
			action: 'duty_roster_template.created',
			resourceType: 'duty_roster_template',
			resourceId: 'template-1'
		});
	});

	it('handles slug collisions inside the Organization', async () => {
		await createDutyRosterTemplate(createCtx(), { name: 'CQ NCO', shortCode: 'CQ' });
		const second = await createDutyRosterTemplate(createCtx(), { name: 'CQ NCO', shortCode: 'CQ' });

		expect(second.slug).toBe('cq-nco-2');
	});

	it('lists and opens active templates by slug for scoped Calendar viewers', async () => {
		await createDutyRosterTemplate(createCtx(), { name: 'Staff Duty NCO', shortCode: 'SD' });
		await createDutyRosterTemplate(createCtx(), { name: 'CQ Runner', shortCode: 'CQ' });

		const viewCtx = createCtx(
			createAuth({
				capabilityMap: {
					calendar: 'view',
					personnel: 'none',
					training: 'none',
					criticalTasks: 'none',
					onboarding: 'none',
					ratingScheme: 'none'
				}
			})
		);

		await expect(listDutyRosterTemplates(viewCtx)).resolves.toEqual([
			expect.objectContaining({ name: 'CQ Runner' }),
			expect.objectContaining({ name: 'Staff Duty NCO' })
		]);
		await expect(findDutyRosterTemplateBySlug(viewCtx, 'staff-duty-nco')).resolves.toEqual(
			expect.objectContaining({ name: 'Staff Duty NCO' })
		);
	});

	it('blocks writes without Calendar operate capability', async () => {
		const ctx = createCtx(
			createAuth({
				capabilityMap: {
					calendar: 'view',
					personnel: 'none',
					training: 'none',
					criticalTasks: 'none',
					onboarding: 'none',
					ratingScheme: 'none'
				}
			})
		);

		await expect(createDutyRosterTemplate(ctx, { name: 'CQ NCO' })).rejects.toMatchObject({
			status: 403
		});
	});

	it('loads settings with resolved pool and baseline rows from active scoped personnel', async () => {
		const ctx = createCtx();
		personnelRows.push(
			personnelRow({ id: 'p1', rank: 'SGT', last_name: 'Able', group_id: 'alpha', groupName: 'Alpha' }),
			personnelRow({ id: 'p2', rank: 'CPL', last_name: 'Baker', group_id: 'alpha', groupName: 'Alpha' }),
			personnelRow({ id: 'p3', rank: 'SGT', last_name: 'Charlie', group_id: 'bravo', groupName: 'Bravo' })
		);
		const template = await createDutyRosterTemplate(ctx, { name: 'CQ NCO', shortCode: 'CQ' });
		const updated = await updateDutyRosterTemplateSettings(ctx, {
			templateId: template.id,
			poolCriteria: {
				rankValues: ['SGT', 'CPL'],
				groupIds: ['alpha'],
				mosValues: [],
				dutyRoleValues: []
			},
			exemptPersonnelIds: ['p1'],
			manualBaselineCounts: { p2: 4 }
		});

		const settings = await loadDutyRosterTemplateSettings(ctx, updated);

		expect(settings.resolvedPool.map((person) => person.id)).toEqual(['p1', 'p2']);
		expect(settings.baselineRows.map((row) => [row.personnel.id, row.startingCount])).toEqual([['p2', 4]]);
	});

	it('rejects exemptions and Manual DA6 Baseline counts outside the resolved non-exempt pool', async () => {
		const ctx = createCtx();
		personnelRows.push(
			personnelRow({ id: 'p1', rank: 'SGT', last_name: 'Able', group_id: 'alpha', groupName: 'Alpha' })
		);
		const template = await createDutyRosterTemplate(ctx, { name: 'CQ NCO', shortCode: 'CQ' });

		await expect(
			updateDutyRosterTemplateSettings(ctx, {
				templateId: template.id,
				poolCriteria: {
					rankValues: ['SGT'],
					groupIds: ['alpha'],
					mosValues: [],
					dutyRoleValues: []
				},
				exemptPersonnelIds: ['missing-person'],
				manualBaselineCounts: {}
			})
		).rejects.toMatchObject({ status: 400 });

		await expect(
			updateDutyRosterTemplateSettings(ctx, {
				templateId: template.id,
				poolCriteria: {
					rankValues: ['SGT'],
					groupIds: ['alpha'],
					mosValues: [],
					dutyRoleValues: []
				},
				exemptPersonnelIds: ['p1'],
				manualBaselineCounts: { p1: 3 }
			})
		).rejects.toMatchObject({ status: 400 });
	});

	it('rejects invalid Manual DA6 Baseline count values instead of dropping them silently', async () => {
		const ctx = createCtx();
		personnelRows.push(
			personnelRow({ id: 'p1', rank: 'SGT', last_name: 'Able', group_id: 'alpha', groupName: 'Alpha' })
		);
		const template = await createDutyRosterTemplate(ctx, { name: 'CQ NCO', shortCode: 'CQ' });

		await expect(
			updateDutyRosterTemplateSettings(ctx, {
				templateId: template.id,
				poolCriteria: {
					rankValues: ['SGT'],
					groupIds: ['alpha'],
					mosValues: [],
					dutyRoleValues: []
				},
				exemptPersonnelIds: [],
				manualBaselineCounts: { p1: Number.NaN }
			})
		).rejects.toMatchObject({
			status: 400,
			message: 'Manual DA6 Baseline counts must be whole numbers zero or greater.'
		});
	});

	it('generates a preview from template setup without mutating accepted history or Calendar tables', async () => {
		const ctx = createCtx();
		personnelRows.push(
			personnelRow({ id: 'alpha', rank: 'SGT', last_name: 'Able', first_name: 'Ann', group_id: 'alpha' }),
			personnelRow({ id: 'bravo', rank: 'SGT', last_name: 'Baker', first_name: 'Ben', group_id: 'alpha' }),
			personnelRow({ id: 'charlie', rank: 'SGT', last_name: 'Charlie', first_name: 'Cal', group_id: 'alpha' })
		);
		statusTypeRows.push(
			statusTypeRow({ id: 'leave', name: 'Leave', da6_availability_treatment: 'authorized-absence' }),
			statusTypeRow({ id: 'detail', name: 'Other Duty', da6_availability_treatment: 'other-duty' })
		);
		availabilityRows.push(
			{
				id: 'leave-alpha',
				organization_id: 'org-1',
				personnel_id: 'alpha',
				status_type_id: 'leave',
				start_date: '2026-06-01',
				end_date: '2026-06-01',
				note: null
			},
			{
				id: 'detail-bravo',
				organization_id: 'org-1',
				personnel_id: 'bravo',
				status_type_id: 'detail',
				start_date: '2026-06-01',
				end_date: '2026-06-01',
				note: null
			}
		);
		const template = await createDutyRosterTemplate(ctx, { name: 'CQ NCO', shortCode: 'CQ' });
		const updated = await updateDutyRosterTemplateSettings(ctx, {
			templateId: template.id,
			poolCriteria: {
				rankValues: ['SGT'],
				groupIds: ['alpha'],
				mosValues: [],
				dutyRoleValues: []
			},
			exemptPersonnelIds: [],
			manualBaselineCounts: {}
		});
		auditEvents.length = 0;
		const templateRowsBefore = rows.length;

		const preview = await generateDutyRosterTemplatePreview(ctx, {
			templateId: updated.id,
			startDate: '2026-06-01',
			endDate: '2026-06-01'
		});

		expect(preview.rosterRows).toEqual([{ date: '2026-06-01', assigneeId: 'charlie' }]);
		expect(preview.da6.rows.map((row) => row.cells[0].da6Code)).toEqual(['A', 'D', null]);
		expect(rows).toHaveLength(templateRowsBefore);
		expect(auditEvents).toEqual([]);
	});

	it('rejects invalid or oversized Generate preview ranges before loading preview data', async () => {
		const ctx = createCtx();
		const template = await createDutyRosterTemplate(ctx, { name: 'CQ NCO', shortCode: 'CQ' });

		await expect(
			generateDutyRosterTemplatePreview(ctx, {
				templateId: template.id,
				startDate: '2026-02-31',
				endDate: '2026-03-01'
			})
		).rejects.toMatchObject({
			status: 400,
			message: 'Start date is required'
		});

		await expect(
			generateDutyRosterTemplatePreview(ctx, {
				templateId: template.id,
				startDate: '2026-06-01',
				endDate: '2026-09-01'
			})
		).rejects.toMatchObject({
			status: 400,
			message: 'Generate preview can cover 62 days or fewer'
		});

		await expect(
			generateDutyRosterTemplatePreview(ctx, {
				templateId: template.id,
				startDate: '2026-03-01',
				endDate: '2026-05-02'
			})
		).rejects.toMatchObject({
			status: 400,
			message: 'Generate preview can cover 62 days or fewer'
		});
	});

	it('applies manual preview selections through a permission-checked use case', async () => {
		const ctx = createCtx();
		personnelRows.push(
			personnelRow({ id: 'alpha', rank: 'SGT', last_name: 'Able', first_name: 'Ann', group_id: 'alpha' }),
			personnelRow({ id: 'bravo', rank: 'SGT', last_name: 'Baker', first_name: 'Ben', group_id: 'alpha' })
		);
		const template = await createDutyRosterTemplate(ctx, { name: 'CQ NCO', shortCode: 'CQ' });
		const preview = await generateDutyRosterTemplatePreview(ctx, {
			templateId: template.id,
			startDate: '2026-06-01',
			endDate: '2026-06-01'
		});

		const updated = await applyDutyRosterTemplatePreviewManualSelection(ctx, {
			preview: JSON.stringify(preview),
			date: '2026-06-01',
			assigneeId: 'bravo',
			reason: null
		});

		expect(updated.manualSelections).toEqual([
			{
				date: '2026-06-01',
				originalAssigneeId: 'alpha',
				assigneeId: 'bravo',
				reason: null,
				warnings: []
			}
		]);
	});

	it('accepts a preview as immutable Duty Roster Template run history', async () => {
		const ctx = createCtx();
		personnelRows.push(
			personnelRow({ id: 'alpha', rank: 'SGT', last_name: 'Able', first_name: 'Ann', group_id: 'alpha' }),
			personnelRow({ id: 'bravo', rank: 'SGT', last_name: 'Baker', first_name: 'Ben', group_id: 'alpha' })
		);
		const template = await createDutyRosterTemplate(ctx, { name: 'CQ NCO', shortCode: 'CQ' });
		const preview = await generateDutyRosterTemplatePreview(ctx, {
			templateId: template.id,
			startDate: '2026-06-01',
			endDate: '2026-06-01'
		});
		const manualPreview = await applyDutyRosterTemplatePreviewManualSelection(ctx, {
			preview: JSON.stringify(preview),
			date: '2026-06-01',
			assigneeId: 'bravo',
			reason: 'Commander directed swap'
		});

		const accepted = await acceptDutyRosterTemplatePreview(ctx, {
			preview: JSON.stringify(manualPreview)
		});

		expect(accepted).toMatchObject({
			id: 'run-1',
			templateId: template.id,
			templateName: 'CQ NCO',
			status: 'accepted',
			startDate: '2026-06-01',
			endDate: '2026-06-01',
			acceptedByUserId: 'user-1'
		});
		expect(acceptedRunRows).toHaveLength(1);
		expect(acceptedRunRows[0].snapshot_payload).toMatchObject({
			snapshotVersion: 1,
			template: { id: template.id, name: 'CQ NCO', shortCode: 'CQ' },
			finalRows: [
				{
					date: '2026-06-01',
					generatedAssigneeId: 'alpha',
					finalAssigneeId: 'bravo',
					assignmentSource: 'manual',
					reason: 'Commander directed swap',
					warnings: []
				}
			]
		});
		expect(auditEvents).toContainEqual({
			action: 'duty_roster_template_run.accepted',
			resourceType: 'duty_roster_template_run',
			resourceId: 'run-1'
		});
	});

	it('rebuilds accepted snapshots from server state instead of trusting hidden preview rows', async () => {
		const ctx = createCtx();
		personnelRows.push(
			personnelRow({ id: 'alpha', rank: 'SGT', last_name: 'Able', first_name: 'Ann', group_id: 'alpha' }),
			personnelRow({ id: 'bravo', rank: 'SGT', last_name: 'Baker', first_name: 'Ben', group_id: 'alpha' })
		);
		const template = await createDutyRosterTemplate(ctx, { name: 'CQ NCO', shortCode: 'CQ' });
		const preview = await generateDutyRosterTemplatePreview(ctx, {
			templateId: template.id,
			startDate: '2026-06-01',
			endDate: '2026-06-01'
		});
		const tamperedPreview = {
			...preview,
			rosterRows: [{ date: '2026-06-01', assigneeId: 'bravo' }]
		};

		await acceptDutyRosterTemplatePreview(ctx, {
			preview: JSON.stringify(tamperedPreview)
		});

		expect(acceptedRunRows[0].snapshot_payload).toMatchObject({
			generatedRows: [{ date: '2026-06-01', assigneeId: 'alpha' }],
			finalRows: [
				{
					date: '2026-06-01',
					generatedAssigneeId: 'alpha',
					finalAssigneeId: 'alpha',
					assignmentSource: 'generated'
				}
			]
		});
	});

	it('uses accepted runs, not Manual DA6 Baseline, as the future preview count source', async () => {
		const ctx = createCtx();
		personnelRows.push(
			personnelRow({ id: 'alpha', rank: 'SGT', last_name: 'Able', first_name: 'Ann', group_id: 'alpha' }),
			personnelRow({ id: 'bravo', rank: 'SGT', last_name: 'Baker', first_name: 'Ben', group_id: 'alpha' }),
			personnelRow({ id: 'charlie', rank: 'SGT', last_name: 'Charlie', first_name: 'Cal', group_id: 'alpha' })
		);
		const template = await createDutyRosterTemplate(ctx, { name: 'CQ NCO', shortCode: 'CQ' });
		await updateDutyRosterTemplateSettings(ctx, {
			templateId: template.id,
			poolCriteria: {
				rankValues: ['SGT'],
				groupIds: ['alpha'],
				mosValues: [],
				dutyRoleValues: []
			},
			exemptPersonnelIds: [],
			manualBaselineCounts: { bravo: 1 }
		});
		const firstPreview = await generateDutyRosterTemplatePreview(ctx, {
			templateId: template.id,
			startDate: '2026-06-01',
			endDate: '2026-06-01'
		});
		expect(firstPreview.rosterRows).toEqual([{ date: '2026-06-01', assigneeId: 'alpha' }]);
		await acceptDutyRosterTemplatePreview(ctx, {
			preview: JSON.stringify(firstPreview)
		});

		const nextPreview = await generateDutyRosterTemplatePreview(ctx, {
			templateId: template.id,
			startDate: '2026-06-02',
			endDate: '2026-06-02'
		});

		expect(nextPreview.rosterRows).toEqual([{ date: '2026-06-02', assigneeId: 'bravo' }]);
	});

	it('lists accepted Duty Roster Template runs newest first', async () => {
		const ctx = createCtx();
		acceptedRunRows.push(
			acceptedRunRow({ id: 'older-run', accepted_at: '2026-06-01T12:00:00.000Z' }),
			acceptedRunRow({ id: 'newer-run', accepted_at: '2026-06-02T12:00:00.000Z' })
		);

		const runs = await listAcceptedDutyRosterTemplateRuns(ctx, 'template-1');

		expect(runs.map((run) => run.id)).toEqual(['newer-run', 'older-run']);
	});

	it('locks Manual DA6 Baseline setup data after the first accepted run', async () => {
		const ctx = createCtx();
		personnelRows.push(
			personnelRow({ id: 'alpha', rank: 'SGT', last_name: 'Able', first_name: 'Ann', group_id: 'alpha' })
		);
		const template = await createDutyRosterTemplate(ctx, { name: 'CQ NCO', shortCode: 'CQ' });
		await updateDutyRosterTemplateSettings(ctx, {
			templateId: template.id,
			poolCriteria: {
				rankValues: ['SGT'],
				groupIds: ['alpha'],
				mosValues: [],
				dutyRoleValues: []
			},
			exemptPersonnelIds: [],
			manualBaselineCounts: { alpha: 2 }
		});
		const preview = await generateDutyRosterTemplatePreview(ctx, {
			templateId: template.id,
			startDate: '2026-06-01',
			endDate: '2026-06-01'
		});
		await acceptDutyRosterTemplatePreview(ctx, {
			preview: JSON.stringify(preview)
		});

		await expect(
			updateDutyRosterTemplateSettings(ctx, {
				templateId: template.id,
				poolCriteria: {
					rankValues: ['SGT'],
					groupIds: ['alpha'],
					mosValues: [],
					dutyRoleValues: []
				},
				exemptPersonnelIds: [],
				manualBaselineCounts: { alpha: 3 }
			})
		).rejects.toMatchObject({
			status: 400,
			message: 'Manual DA6 Baseline is locked after the first accepted run.'
		});
	});
});

function tableRows(table: string): Record<string, unknown>[] {
	switch (table) {
		case 'availability_entries':
			return availabilityRows;
		case 'duty_roster_template_runs':
			return acceptedRunRows;
		case 'personnel':
			return personnelRows;
		case 'special_days':
			return specialDayRows;
		case 'status_types':
			return statusTypeRows;
		default:
			return rows;
	}
}

function personnelRow(overrides: Record<string, unknown>): Record<string, unknown> {
	return {
		id: 'p1',
		organization_id: 'org-1',
		rank: 'SGT',
		first_name: 'Test',
		last_name: 'Soldier',
		mos: '11B',
		clinic_role: 'Rifleman',
		group_id: null,
		groups: { name: overrides.groupName ?? '' },
		archived_at: null,
		...overrides
	};
}

function statusTypeRow(overrides: Record<string, unknown>): Record<string, unknown> {
	return {
		id: 'status',
		organization_id: 'org-1',
		name: 'Status',
		color: '#111827',
		text_color: '#ffffff',
		da6_availability_treatment: null,
		da6_treatment_reviewed: true,
		sort_order: 0,
		...overrides
	};
}

function acceptedRunRow(overrides: Record<string, unknown>): Record<string, unknown> {
	return {
		id: 'run-1',
		organization_id: 'org-1',
		template_id: 'template-1',
		template_name: 'CQ NCO',
		status: 'accepted',
		start_date: '2026-06-01',
		end_date: '2026-06-01',
		snapshot_payload: {
			snapshotVersion: 1,
			template: {
				id: 'template-1',
				name: 'CQ NCO',
				shortCode: 'CQ'
			},
			generatedAt: '2026-06-01T00:00:00.000Z',
			acceptedAt: String(overrides.accepted_at ?? '2026-06-01T12:00:00.000Z'),
			acceptedByUserId: 'user-1',
			config: {
				startDate: '2026-06-01',
				endDate: '2026-06-01'
			},
			resolvedPool: [],
			selectionPersonnel: [],
			generatedRows: [],
			finalRows: [],
			manualSelections: [],
			da6: { columns: [], rows: [] },
			exportModel: { title: 'CQ NCO', sequencePeriods: [], rows: [] },
			warnings: []
		},
		accepted_by_user_id: 'user-1',
		accepted_at: '2026-06-01T12:00:00.000Z',
		created_at: '2026-06-01T12:00:00.000Z',
		...overrides
	};
}
