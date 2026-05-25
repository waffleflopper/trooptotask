import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuditPort, AuthContext, DataStore, ReadOnlyGuard } from '$lib/server/core/ports';
import {
	acceptDutyRosterTemplatePreview,
	acceptAndApplyDutyRosterTemplatePreview,
	applyAcceptedDutyRosterTemplateRun,
	applyDutyRosterTemplatePreviewManualSelection,
	archiveDutyRosterTemplate,
	createConfiguredDutyRosterTemplate,
	createDutyRosterTemplate,
	findDutyRosterTemplateBySlug,
	generateDutyRosterTemplatePreview,
	invalidateLatestDutyRosterTemplateRun,
	listAcceptedDutyRosterTemplateRunHistory,
	listAcceptedDutyRosterTemplateRuns,
	listDutyRosterTemplates,
	loadDutyRosterTemplateCountReadModel,
	loadDutyRosterTemplateSettings,
	recordDutyRosterTemplateRunCorrection,
	updateDutyRosterTemplateSettings
} from './dutyRosterTemplates';

const rows: Record<string, unknown>[] = [];
const assignmentTypeRows: Record<string, unknown>[] = [];
const acceptedRunRows: Record<string, unknown>[] = [];
const correctionRows: Record<string, unknown>[] = [];
const dailyAssignmentRows: Record<string, unknown>[] = [];
const personnelRows: Record<string, unknown>[] = [];
const availabilityRows: Record<string, unknown>[] = [];
const specialDayRows: Record<string, unknown>[] = [];
const statusTypeRows: Record<string, unknown>[] = [];
const dutyEventRows: Record<string, unknown>[] = [];
const dutyEventSlotRows: Record<string, unknown>[] = [];
const auditEvents: Array<{
	action: string;
	resourceType: string;
	resourceId?: string;
	details?: Record<string, unknown>;
}> = [];

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
		compatibilityLanes: {},
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

		if (options?.inFilters) {
			result = result.filter((row) =>
				Object.entries(options.inFilters ?? {}).every(([key, values]) => values.includes(row[key]))
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

		if (options?.range) {
			result = result.slice(options.range.from, options.range.to + 1);
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

		if (table === 'duty_roster_template_run_corrections') {
			const row = {
				id: `correction-${correctionRows.length + 1}`,
				organization_id: orgId,
				...data
			};
			correctionRows.push(row);
			return row;
		}

		if (table === 'assignment_types') {
			const row = {
				id: String(data.id ?? `assignment-type-${assignmentTypeRows.length + 1}`),
				organization_id: orgId,
				...data
			};
			assignmentTypeRows.push(row);
			return row;
		}

		if (table === 'daily_assignments') {
			const row = {
				id: `daily-assignment-${dailyAssignmentRows.length + 1}`,
				organization_id: orgId,
				...data
			};
			dailyAssignmentRows.push(row);
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
		if (
			table === 'duty_roster_templates' &&
			typeof data.slug === 'string' &&
			source.some((row) => row.organization_id === orgId && row.id !== id && row.slug === data.slug)
		) {
			throw new Error('duplicate key value violates unique constraint "duty_roster_templates_org_slug_key"');
		}

		source[index] = { ...source[index], ...data };
		return source[index];
	},
	updateById: vi.fn(),
	async delete(table, orgId, id) {
		const source = tableRows(table);
		const index = source.findIndex((row) => row.organization_id === orgId && row.id === id);
		if (index !== -1) {
			source.splice(index, 1);
		}
	},
	async deleteWhere(table, orgId, filters) {
		const source = tableRows(table);
		for (let index = source.length - 1; index >= 0; index -= 1) {
			const row = source[index];
			if (row?.organization_id === orgId && Object.entries(filters).every(([key, value]) => row[key] === value)) {
				source.splice(index, 1);
			}
		}
	},
	async deleteWhereAny(table, orgId, filterGroups) {
		const source = tableRows(table);
		for (let index = source.length - 1; index >= 0; index -= 1) {
			const row = source[index];
			if (
				row?.organization_id === orgId &&
				filterGroups.some((filters) => Object.entries(filters).every(([key, value]) => row[key] === value))
			) {
				source.splice(index, 1);
			}
		}
	},
	deleteManyByIds: vi.fn(),
	async insertMany(table, orgId, dataRows) {
		const inserted: Record<string, unknown>[] = [];
		for (const data of dataRows) {
			inserted.push((await store.insert(table, orgId, data)) as Record<string, unknown>);
		}
		return inserted;
	},
	findManyWithCount: vi.fn(),
	listDistinctAuditActions: vi.fn()
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

async function withTimezone<T>(timezone: string, callback: () => Promise<T>): Promise<T> {
	const previousTimezone = process.env.TZ;
	process.env.TZ = timezone;
	try {
		return await callback();
	} finally {
		if (previousTimezone === undefined) {
			delete process.env.TZ;
		} else {
			process.env.TZ = previousTimezone;
		}
	}
}

describe('Duty Roster Template use cases', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-05-04T12:00:00.000Z'));
		rows.length = 0;
		assignmentTypeRows.length = 0;
		acceptedRunRows.length = 0;
		correctionRows.length = 0;
		dailyAssignmentRows.length = 0;
		personnelRows.length = 0;
		availabilityRows.length = 0;
		specialDayRows.length = 0;
		statusTypeRows.length = 0;
		dutyEventRows.length = 0;
		dutyEventSlotRows.length = 0;
		auditEvents.length = 0;
		vi.mocked(readOnlyGuard.check).mockResolvedValue(false);
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('allows a scoped Calendar operator to create one-duty templates', async () => {
		const template = await createDutyRosterTemplate(createCtx(), { name: 'CQ NCO', shortCode: 'cq' });

		expect(template).toMatchObject({
			assignmentTypeId: template.id,
			name: 'CQ NCO',
			slug: 'cq-nco',
			shortCode: 'CQ',
			status: 'active'
		});
		expect(assignmentTypeRows).toContainEqual(
			expect.objectContaining({
				id: template.id,
				name: 'CQ NCO',
				short_name: 'CQ',
				assign_to: 'personnel',
				show_in_date_header: false
			})
		);
		expect(auditEvents).toContainEqual({
			action: 'duty_roster_template.created',
			resourceType: 'duty_roster_template',
			resourceId: template.id
		});
	});

	it('handles slug collisions inside the Organization', async () => {
		await createDutyRosterTemplate(createCtx(), { name: 'CQ NCO', shortCode: 'CQ' });
		const second = await createDutyRosterTemplate(createCtx(), { name: 'CQ NCO', shortCode: 'CQ' });

		expect(second.slug).toBe('cq-nco-2');
	});

	it('archives only the Duty Roster Template by default', async () => {
		const ctx = createCtx();
		const template = await createDutyRosterTemplate(ctx, { name: 'CQ NCO', shortCode: 'CQ' });

		const archived = await archiveDutyRosterTemplate(ctx, { templateId: template.id });

		expect(archived.status).toBe('archived');
		expect(assignmentTypeRows.find((row) => row.id === template.assignmentTypeId)?.archived_at).toBeUndefined();
		expect(auditEvents).toContainEqual(
			expect.objectContaining({
				action: 'duty_roster_template.archived',
				resourceType: 'duty_roster_template',
				resourceId: template.id,
				details: {
					archiveAssignmentType: false,
					assignmentTypeId: template.assignmentTypeId
				}
			})
		);
	});

	it('optionally archives the companion Calendar assignment type', async () => {
		const ctx = createCtx();
		const template = await createDutyRosterTemplate(ctx, { name: 'CQ NCO', shortCode: 'CQ' });

		await archiveDutyRosterTemplate(ctx, { templateId: template.id, archiveAssignmentType: true });

		expect(assignmentTypeRows.find((row) => row.id === template.assignmentTypeId)?.archived_at).toBe(
			'2026-05-04T12:00:00.000Z'
		);
		expect(auditEvents).toContainEqual(
			expect.objectContaining({
				action: 'duty_roster_template.archived',
				details: {
					archiveAssignmentType: true,
					assignmentTypeId: template.assignmentTypeId
				}
			})
		);
	});

	it('creates a configured Duty Roster Template in one use-case call', async () => {
		const ctx = createCtx();
		personnelRows.push(
			personnelRow({ id: 'p1', rank: 'SGT', last_name: 'Able', group_id: 'alpha', groupName: 'Alpha' }),
			personnelRow({ id: 'p2', rank: 'SGT', last_name: 'Baker', group_id: 'alpha', groupName: 'Alpha' }),
			personnelRow({ id: 'p3', rank: 'CPL', last_name: 'Charlie', group_id: 'bravo', groupName: 'Bravo' })
		);

		const template = await createConfiguredDutyRosterTemplate(ctx, {
			name: 'CQ NCO',
			slug: 'cq-nco',
			shortCode: 'CQ',
			poolCriteria: {
				rankValues: ['SGT'],
				groupIds: ['alpha'],
				mosValues: [],
				dutyRoleValues: []
			},
			exemptPersonnelIds: ['p1'],
			manualBaselineCounts: { p2: 3 }
		});

		expect(template).toMatchObject({
			name: 'CQ NCO',
			slug: 'cq-nco',
			shortCode: 'CQ',
			poolCriteria: {
				rankValues: ['SGT'],
				groupIds: ['alpha'],
				mosValues: [],
				dutyRoleValues: []
			},
			exemptPersonnelIds: ['p1'],
			manualBaselineCounts: { p2: 3 }
		});
		expect(assignmentTypeRows).toContainEqual(
			expect.objectContaining({
				id: template.assignmentTypeId,
				name: 'CQ NCO',
				short_name: 'CQ'
			})
		);
	});

	it('rejects invalid configured setup before creating partial template rows', async () => {
		const ctx = createCtx();
		personnelRows.push(
			personnelRow({ id: 'p1', rank: 'SGT', last_name: 'Able', group_id: 'alpha', groupName: 'Alpha' })
		);

		await expect(
			createConfiguredDutyRosterTemplate(ctx, {
				name: 'CQ NCO',
				slug: 'cq-nco',
				shortCode: 'CQ',
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

		expect(rows).toHaveLength(0);
		expect(assignmentTypeRows).toHaveLength(0);
	});

	it('cleans up companion assignment types when simple template creation fails after assignment type creation', async () => {
		const originalInsert = store.insert.bind(store);
		const insertSpy = vi.spyOn(store, 'insert').mockImplementation(async (table, orgId, data, select) => {
			if (table === 'duty_roster_templates') {
				throw new Error('template insert failed');
			}
			return originalInsert(table, orgId, data, select);
		});

		await expect(createDutyRosterTemplate(createCtx(), { name: 'CQ NCO', shortCode: 'CQ' })).rejects.toThrow(
			'template insert failed'
		);

		expect(rows).toHaveLength(0);
		expect(assignmentTypeRows).toHaveLength(0);
		insertSpy.mockRestore();
	});

	it('cleans up companion assignment types when configured template creation fails after assignment type creation', async () => {
		const ctx = createCtx();
		personnelRows.push(
			personnelRow({ id: 'p1', rank: 'SGT', last_name: 'Able', group_id: 'alpha', groupName: 'Alpha' })
		);
		const originalInsert = store.insert.bind(store);
		const insertSpy = vi.spyOn(store, 'insert').mockImplementation(async (table, orgId, data, select) => {
			if (table === 'duty_roster_templates') {
				throw new Error('configured template insert failed');
			}
			return originalInsert(table, orgId, data, select);
		});

		await expect(
			createConfiguredDutyRosterTemplate(ctx, {
				name: 'CQ NCO',
				slug: 'cq-nco',
				shortCode: 'CQ',
				poolCriteria: {
					rankValues: ['SGT'],
					groupIds: ['alpha'],
					mosValues: [],
					dutyRoleValues: []
				},
				exemptPersonnelIds: [],
				manualBaselineCounts: { p1: 1 }
			})
		).rejects.toThrow('configured template insert failed');

		expect(rows).toHaveLength(0);
		expect(assignmentTypeRows).toHaveLength(0);
		insertSpy.mockRestore();
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
			name: template.name,
			slug: template.slug,
			shortCode: template.shortCode,
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

	it('updates template identity settings and keeps the companion Calendar assignment type aligned', async () => {
		const ctx = createCtx();
		const template = await createDutyRosterTemplate(ctx, { name: 'CQ NCO', shortCode: 'CQ' });

		const updated = await updateDutyRosterTemplateSettings(ctx, {
			templateId: template.id,
			name: 'Staff Duty NCO',
			slug: 'staff-duty-nco',
			shortCode: 'SD',
			poolCriteria: template.poolCriteria,
			exemptPersonnelIds: [],
			manualBaselineCounts: {}
		});

		expect(updated).toMatchObject({
			name: 'Staff Duty NCO',
			slug: 'staff-duty-nco',
			shortCode: 'SD'
		});
		expect(assignmentTypeRows[0]).toMatchObject({
			id: template.assignmentTypeId,
			name: 'Staff Duty NCO',
			short_name: 'SD'
		});
	});

	it('rejects template slug collisions inside the Organization during settings updates', async () => {
		const ctx = createCtx();
		const first = await createDutyRosterTemplate(ctx, { name: 'CQ NCO', shortCode: 'CQ' });
		await createDutyRosterTemplate(ctx, { name: 'Staff Duty NCO', shortCode: 'SD' });

		await expect(
			updateDutyRosterTemplateSettings(ctx, {
				templateId: first.id,
				name: first.name,
				slug: 'staff-duty-nco',
				shortCode: first.shortCode,
				poolCriteria: first.poolCriteria,
				exemptPersonnelIds: [],
				manualBaselineCounts: {}
			})
		).rejects.toMatchObject({
			status: 400,
			message: 'Duty Roster Template slug is already in use.'
		});
	});

	it('rechecks template slug uniqueness immediately before settings writes', async () => {
		const ctx = createCtx();
		const template = await createDutyRosterTemplate(ctx, { name: 'CQ NCO', shortCode: 'CQ' });
		const originalFindMany = store.findMany.bind(store);
		let slugChecks = 0;
		const findManySpy = vi.spyOn(store, 'findMany').mockImplementation(async (table, orgId, filters, options) => {
			if (table === 'duty_roster_templates' && filters?.slug === 'updated-cq') {
				slugChecks += 1;
				if (slugChecks === 2) {
					rows.push({
						id: 'template-concurrent',
						organization_id: orgId,
						name: 'Concurrent CQ',
						slug: 'updated-cq',
						assignment_type_id: 'assignment-type-concurrent',
						short_code: 'CCQ',
						status: 'active',
						pool_criteria: { rankValues: [], groupIds: [], mosValues: [], dutyRoleValues: [] },
						exempt_personnel_ids: [],
						manual_baseline_counts: {},
						created_at: '2026-05-04T12:01:00.000Z',
						updated_at: '2026-05-04T12:01:00.000Z'
					});
				}
			}
			return originalFindMany(table, orgId, filters, options);
		});

		await expect(
			updateDutyRosterTemplateSettings(ctx, {
				templateId: template.id,
				name: 'Updated CQ',
				slug: 'updated-cq',
				shortCode: 'UCQ',
				poolCriteria: { rankValues: [], groupIds: [], mosValues: [], dutyRoleValues: [] },
				exemptPersonnelIds: [],
				manualBaselineCounts: {}
			})
		).rejects.toMatchObject({
			status: 400,
			message: 'Duty Roster Template slug is already in use.'
		});

		expect(rows.find((row) => row.id === template.id)).toMatchObject({
			name: 'CQ NCO',
			slug: 'cq-nco'
		});
		findManySpy.mockRestore();
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

	it('allows Manual DA6 Baseline updates when only invalidated accepted history remains', async () => {
		const ctx = createCtx(createAuth({ scopeSet: { kind: 'groups', groupIds: ['alpha'] } }));
		personnelRows.push(
			personnelRow({ id: 'alpha', rank: 'SGT', last_name: 'Able', first_name: 'Ann', group_id: 'alpha' })
		);
		const template = await createDutyRosterTemplate(ctx, { name: 'CQ NCO', shortCode: 'CQ' });
		acceptedRunRows.push(
			acceptedRunRow({
				id: 'run-invalidated',
				template_id: template.id,
				template_name: template.name,
				status: 'invalidated',
				invalidated_at: '2026-06-01T13:00:00.000Z',
				invalidated_by_user_id: 'user-1'
			})
		);

		const updated = await updateDutyRosterTemplateSettings(ctx, {
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

		expect(updated.manualBaselineCounts).toEqual({ alpha: 2 });
		expect(rows.find((row) => row.id === template.id)?.manual_baseline_counts).toEqual({ alpha: 2 });
	});

	it('keeps accepted-run baseline rows locked while allowing newly added pool personnel baseline counts', async () => {
		const ctx = createCtx(createAuth({ scopeSet: { kind: 'groups', groupIds: ['alpha'] } }));
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
		await acceptDutyRosterTemplatePreview(ctx, {
			preview: JSON.stringify(preview)
		});
		personnelRows.push(
			personnelRow({ id: 'charlie', rank: 'SGT', last_name: 'Charlie', first_name: 'Cal', group_id: 'alpha' })
		);

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
				manualBaselineCounts: { alpha: 2, charlie: 3 }
			})
		).rejects.toMatchObject({
			status: 400,
			message: 'Manual DA6 Baseline is locked for Soldiers who already appeared in accepted history.'
		});

		const updated = await updateDutyRosterTemplateSettings(ctx, {
			templateId: template.id,
			poolCriteria: {
				rankValues: ['SGT'],
				groupIds: ['alpha'],
				mosValues: [],
				dutyRoleValues: []
			},
			exemptPersonnelIds: [],
			manualBaselineCounts: { charlie: 3 }
		});

		expect(updated.manualBaselineCounts).toEqual({ charlie: 3 });
		expect(rows.find((row) => row.id === template.id)?.manual_baseline_counts).toEqual({ charlie: 3 });
	});

	it('preserves omitted locked Manual DA6 Baseline counts when saving editable rows', async () => {
		const ctx = createCtx(createAuth({ scopeSet: { kind: 'groups', groupIds: ['alpha'] } }));
		personnelRows.push(
			personnelRow({ id: 'alpha', rank: 'SGT', last_name: 'Able', first_name: 'Ann', group_id: 'alpha' }),
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
			manualBaselineCounts: { alpha: 3 }
		});
		acceptedRunRows.push(
			acceptedRunRow({
				id: 'run-accepted-alpha',
				template_id: template.id,
				template_name: template.name,
				snapshot_payload: acceptedRunSnapshotPayload({
					templateId: template.id,
					templateName: template.name,
					personnelIds: ['alpha']
				})
			})
		);

		const updated = await updateDutyRosterTemplateSettings(ctx, {
			templateId: template.id,
			poolCriteria: {
				rankValues: ['SGT'],
				groupIds: ['alpha'],
				mosValues: [],
				dutyRoleValues: []
			},
			exemptPersonnelIds: [],
			manualBaselineCounts: { charlie: 2 }
		});

		expect(updated.manualBaselineCounts).toEqual({ alpha: 3, charlie: 2 });
		expect(rows.find((row) => row.id === template.id)?.manual_baseline_counts).toEqual({ alpha: 3, charlie: 2 });
	});

	it('does not lock existing Soldiers who were only selectable in accepted history', async () => {
		const ctx = createCtx(createAuth({ scopeSet: { kind: 'groups', groupIds: ['alpha'] } }));
		personnelRows.push(
			personnelRow({ id: 'alpha', rank: 'SGT', last_name: 'Able', first_name: 'Ann', group_id: 'alpha' }),
			personnelRow({ id: 'bravo', rank: 'SPC', last_name: 'Baker', first_name: 'Ben', group_id: 'alpha' })
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
			manualBaselineCounts: {}
		});
		const preview = await generateDutyRosterTemplatePreview(ctx, {
			templateId: template.id,
			startDate: '2026-06-01',
			endDate: '2026-06-01'
		});
		expect(preview.personnel.map((person) => person.id)).toEqual(['alpha']);
		expect(preview.selectionPersonnel.map((person) => person.id)).toContain('bravo');
		await acceptDutyRosterTemplatePreview(ctx, {
			preview: JSON.stringify(preview)
		});

		const updated = await updateDutyRosterTemplateSettings(ctx, {
			templateId: template.id,
			poolCriteria: {
				rankValues: ['SGT', 'SPC'],
				groupIds: ['alpha'],
				mosValues: [],
				dutyRoleValues: []
			},
			exemptPersonnelIds: [],
			manualBaselineCounts: { bravo: 2 }
		});

		expect(updated.manualBaselineCounts).toEqual({ bravo: 2 });
		expect(rows.find((row) => row.id === template.id)?.manual_baseline_counts).toEqual({ bravo: 2 });
	});

	it('rechecks Manual DA6 Baseline locks immediately before settings writes', async () => {
		const ctx = createCtx(createAuth({ scopeSet: { kind: 'groups', groupIds: ['alpha'] } }));
		personnelRows.push(
			personnelRow({ id: 'alpha', rank: 'SGT', last_name: 'Able', first_name: 'Ann', group_id: 'alpha' })
		);
		const template = await createDutyRosterTemplate(ctx, { name: 'CQ NCO', shortCode: 'CQ' });
		const originalFindMany = store.findMany.bind(store);
		let acceptedRunChecks = 0;
		const findManySpy = vi.spyOn(store, 'findMany').mockImplementation(async (table, orgId, filters, options) => {
			if (table === 'duty_roster_template_runs' && filters?.template_id === template.id) {
				acceptedRunChecks += 1;
				if (acceptedRunChecks === 2) {
					acceptedRunRows.push(
						acceptedRunRow({
							id: 'run-concurrent',
							template_id: template.id,
							template_name: template.name,
							accepted_at: '2026-05-04T12:01:00.000Z',
							snapshot_payload: acceptedRunSnapshotPayload({
								templateId: template.id,
								templateName: template.name,
								personnelIds: ['alpha']
							})
						})
					);
				}
			}
			return originalFindMany(table, orgId, filters, options);
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
				manualBaselineCounts: { alpha: 1 }
			})
		).rejects.toMatchObject({
			status: 409,
			message: 'Manual DA6 Baseline is locked because this template accepted a run. Refresh settings and try again.'
		});

		expect(rows.find((row) => row.id === template.id)?.manual_baseline_counts).toEqual({});
		findManySpy.mockRestore();
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

	it('validates Generate preview start dates against UTC today instead of server-local midnight', async () => {
		await withTimezone('America/Anchorage', async () => {
			vi.setSystemTime(new Date('2026-05-05T00:30:00.000Z'));
			const ctx = createCtx();
			const template = await createDutyRosterTemplate(ctx, { name: 'CQ NCO', shortCode: 'CQ' });

			await expect(
				generateDutyRosterTemplatePreview(ctx, {
					templateId: template.id,
					startDate: '2026-05-04',
					endDate: '2026-05-04'
				})
			).rejects.toMatchObject({
				status: 400,
				message: 'Duty Roster previews cannot start in the past'
			});

			await expect(
				generateDutyRosterTemplatePreview(ctx, {
					templateId: template.id,
					startDate: '2026-05-05',
					endDate: '2026-05-05'
				})
			).resolves.toMatchObject({
				config: {
					startDate: '2026-05-05',
					endDate: '2026-05-05'
				}
			});
		});
	});

	it('generates preview dates from selected weekdays while skipping holidays and DONSAs', async () => {
		const ctx = createCtx();
		personnelRows.push(
			personnelRow({ id: 'alpha', rank: 'SGT', last_name: 'Able', first_name: 'Ann', group_id: 'group-1' }),
			personnelRow({ id: 'bravo', rank: 'SGT', last_name: 'Baker', first_name: 'Ben', group_id: 'group-1' })
		);
		specialDayRows.push(
			{
				id: 'holiday',
				organization_id: 'org-1',
				date: '2026-06-03',
				name: 'Training Holiday',
				type: 'federal-holiday'
			},
			{
				id: 'donsa',
				organization_id: 'org-1',
				date: '2026-06-05',
				name: 'DONSA',
				type: 'org-closure'
			}
		);
		const template = await createDutyRosterTemplate(ctx, { name: 'CQ NCO', shortCode: 'CQ' });

		const preview = await generateDutyRosterTemplatePreview(ctx, {
			templateId: template.id,
			startDate: '2026-06-01',
			endDate: '2026-06-07',
			pattern: 'selected-weekdays',
			selectedWeekdays: [1, 3, 5],
			skipHolidaysAndDonsas: true
		});

		expect(preview.rosterRows.map((row) => row.date)).toEqual(['2026-06-01']);
		expect(preview.config).toMatchObject({
			pattern: 'selected-weekdays',
			selectedWeekdays: [1, 3, 5],
			excludeHolidays: true,
			excludeOrgClosures: true
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

	it('rejects oversized preview payloads before manual selection parsing', async () => {
		await expect(
			applyDutyRosterTemplatePreviewManualSelection(createCtx(), {
				preview: oversizedPreviewPayload(),
				date: '2026-06-01',
				assigneeId: 'alpha',
				reason: null
			})
		).rejects.toMatchObject({
			status: 400,
			message: 'Duty Roster preview payload is too large. Generate the preview again.'
		});
	});

	it('rejects malformed preview payloads during manual selection', async () => {
		await expect(
			applyDutyRosterTemplatePreviewManualSelection(createCtx(), {
				preview: '{"snapshotVersion":',
				date: '2026-06-01',
				assigneeId: 'alpha',
				reason: null
			})
		).rejects.toMatchObject({
			status: 400
		});
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

	it('rejects oversized preview payloads before accept parsing', async () => {
		await expect(
			acceptDutyRosterTemplatePreview(createCtx(), {
				preview: oversizedPreviewPayload()
			})
		).rejects.toMatchObject({
			status: 400,
			message: 'Duty Roster preview payload is too large. Generate the preview again.'
		});
	});

	it('rejects malformed preview payloads during accept', async () => {
		await expect(
			acceptDutyRosterTemplatePreview(createCtx(), {
				preview: '{"snapshotVersion":'
			})
		).rejects.toMatchObject({
			status: 400
		});
	});

	it('rejects accepted previews whose generated rows no longer match the reviewed preview', async () => {
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

		await expect(
			acceptDutyRosterTemplatePreview(ctx, {
				preview: JSON.stringify(tamperedPreview)
			})
		).rejects.toMatchObject({
			status: 409,
			message: 'Duty Roster preview changed. Generate the preview again before accepting.'
		});
		expect(acceptedRunRows).toHaveLength(0);
	});

	it('rejects stale accepted previews instead of silently accepting changed current state', async () => {
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
		personnelRows[0].last_name = 'Changed';

		await expect(
			acceptDutyRosterTemplatePreview(ctx, {
				preview: JSON.stringify(preview)
			})
		).rejects.toMatchObject({
			status: 409,
			message: 'Duty Roster preview changed. Generate the preview again before accepting.'
		});
		expect(acceptedRunRows).toHaveLength(0);
	});

	it('accepts a preview before applying it to Calendar with run row lineage', async () => {
		const ctx = createCtx(createAuth({ scopeSet: { kind: 'groups', groupIds: ['alpha'] } }));
		personnelRows.push(
			personnelRow({ id: 'alpha', rank: 'SGT', last_name: 'Able', first_name: 'Ann', group_id: 'alpha' }),
			personnelRow({ id: 'bravo', rank: 'SGT', last_name: 'Baker', first_name: 'Ben', group_id: 'alpha' })
		);
		const template = await createDutyRosterTemplate(ctx, { name: 'CQ NCO', shortCode: 'CQ' });
		const preview = await generateDutyRosterTemplatePreview(ctx, {
			templateId: template.id,
			startDate: '2026-06-01',
			endDate: '2026-06-02'
		});

		const result = await acceptAndApplyDutyRosterTemplatePreview(ctx, {
			preview: JSON.stringify(preview)
		});

		expect(result.acceptedRun.appliedAt).toEqual(expect.any(String));
		expect(result.insertedCount).toBe(2);
		expect(dailyAssignmentRows).toEqual([
			expect.objectContaining({
				date: '2026-06-01',
				assignment_type_id: template.assignmentTypeId,
				assignee_id: 'alpha',
				duty_roster_template_run_id: result.acceptedRun.id,
				duty_roster_template_run_row_date: '2026-06-01'
			}),
			expect.objectContaining({
				date: '2026-06-02',
				assignment_type_id: template.assignmentTypeId,
				assignee_id: 'bravo',
				duty_roster_template_run_id: result.acceptedRun.id,
				duty_roster_template_run_row_date: '2026-06-02'
			})
		]);
		expect(auditEvents).toContainEqual(
			expect.objectContaining({
				action: 'duty_roster_template_run.applied_to_calendar',
				resourceType: 'duty_roster_template_run',
				resourceId: result.acceptedRun.id
			})
		);
	});

	it('rolls back accepted history when accept-and-apply cannot write Calendar assignments', async () => {
		const ctx = createCtx(createAuth({ scopeSet: { kind: 'groups', groupIds: ['alpha'] } }));
		personnelRows.push(
			personnelRow({ id: 'alpha', rank: 'SGT', last_name: 'Able', first_name: 'Ann', group_id: 'alpha' })
		);
		const template = await createDutyRosterTemplate(ctx, { name: 'CQ NCO', shortCode: 'CQ' });
		const preview = await generateDutyRosterTemplatePreview(ctx, {
			templateId: template.id,
			startDate: '2026-06-01',
			endDate: '2026-06-01'
		});
		const insertManySpy = vi.spyOn(store, 'insertMany').mockRejectedValueOnce(new Error('Calendar apply failed.'));

		await expect(
			acceptAndApplyDutyRosterTemplatePreview(ctx, {
				preview: JSON.stringify(preview)
			})
		).rejects.toThrow('Calendar apply failed.');

		expect(acceptedRunRows).toHaveLength(0);
		expect(dailyAssignmentRows).toHaveLength(0);
		expect(auditEvents).not.toContainEqual(expect.objectContaining({ action: 'duty_roster_template_run.accepted' }));
		expect(auditEvents).not.toContainEqual(
			expect.objectContaining({ action: 'duty_roster_template_run.applied_to_calendar' })
		);

		insertManySpy.mockRestore();

		const retry = await acceptAndApplyDutyRosterTemplatePreview(ctx, {
			preview: JSON.stringify(preview)
		});

		expect(acceptedRunRows).toHaveLength(1);
		expect(retry.acceptedRun.appliedAt).toEqual(expect.any(String));
		expect(dailyAssignmentRows).toHaveLength(1);
	});

	it('applies an accepted run later from history', async () => {
		const ctx = createCtx(createAuth({ scopeSet: { kind: 'groups', groupIds: ['alpha'] } }));
		personnelRows.push(
			personnelRow({ id: 'alpha', rank: 'SGT', last_name: 'Able', first_name: 'Ann', group_id: 'alpha' })
		);
		const template = await createDutyRosterTemplate(ctx, { name: 'CQ NCO', shortCode: 'CQ' });
		const preview = await generateDutyRosterTemplatePreview(ctx, {
			templateId: template.id,
			startDate: '2026-06-01',
			endDate: '2026-06-01'
		});
		const accepted = await acceptDutyRosterTemplatePreview(ctx, {
			preview: JSON.stringify(preview)
		});

		const result = await applyAcceptedDutyRosterTemplateRun(ctx, { runId: accepted.id });

		expect(result.acceptedRun.appliedAt).toEqual(expect.any(String));
		expect(dailyAssignmentRows).toEqual([
			expect.objectContaining({
				date: '2026-06-01',
				assignment_type_id: template.assignmentTypeId,
				assignee_id: 'alpha',
				duty_roster_template_run_id: accepted.id,
				duty_roster_template_run_row_date: '2026-06-01'
			})
		]);
	});

	it('re-applies an already applied accepted run when Calendar needs sync', async () => {
		const ctx = createCtx(createAuth({ scopeSet: { kind: 'groups', groupIds: ['alpha'] } }));
		personnelRows.push(
			personnelRow({ id: 'alpha', rank: 'SGT', last_name: 'Able', first_name: 'Ann', group_id: 'alpha' })
		);
		const template = await createDutyRosterTemplate(ctx, { name: 'CQ NCO', shortCode: 'CQ' });
		const preview = await generateDutyRosterTemplatePreview(ctx, {
			templateId: template.id,
			startDate: '2026-06-01',
			endDate: '2026-06-01'
		});
		const accepted = await acceptDutyRosterTemplatePreview(ctx, {
			preview: JSON.stringify(preview)
		});
		await applyAcceptedDutyRosterTemplateRun(ctx, { runId: accepted.id });

		const result = await applyAcceptedDutyRosterTemplateRun(ctx, { runId: accepted.id });

		expect(result.acceptedRun.appliedAt).toEqual(expect.any(String));
		expect(dailyAssignmentRows).toHaveLength(1);
	});

	it('rejects unsupported accepted snapshot versions before applying a run', async () => {
		const ctx = createCtx();
		acceptedRunRows.push(
			acceptedRunRow({
				id: 'run-v2',
				snapshot_payload: { snapshotVersion: 2 }
			})
		);

		await expect(applyAcceptedDutyRosterTemplateRun(ctx, { runId: 'run-v2' })).rejects.toMatchObject({
			status: 500,
			message: 'Unsupported Duty Roster accepted snapshot version.'
		});
		expect(dailyAssignmentRows).toHaveLength(0);
	});

	it('records append-only corrections and uses the replacement Soldier for future counts', async () => {
		const ctx = createCtx(createAuth({ scopeSet: { kind: 'groups', groupIds: ['alpha'] } }));
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
		const applied = await acceptAndApplyDutyRosterTemplatePreview(ctx, {
			preview: JSON.stringify(preview)
		});

		const correction = await recordDutyRosterTemplateRunCorrection(ctx, {
			runId: applied.acceptedRun.id,
			runRowDate: '2026-06-01',
			replacementAssigneeId: 'bravo',
			reason: 'Emergency leave swap.'
		});
		const listedRuns = await listAcceptedDutyRosterTemplateRuns(ctx, template.id);
		const nextPreview = await generateDutyRosterTemplatePreview(ctx, {
			templateId: template.id,
			startDate: '2026-06-02',
			endDate: '2026-06-02'
		});

		expect(correction).toMatchObject({
			runId: applied.acceptedRun.id,
			runRowDate: '2026-06-01',
			originalAssigneeId: 'alpha',
			replacementAssigneeId: 'bravo',
			reason: 'Emergency leave swap.',
			countsTowardFuture: true,
			poolOverride: false,
			poolOverrideReasons: []
		});
		expect(correctionRows).toHaveLength(1);
		expect(listedRuns[0].corrections).toEqual([
			expect.objectContaining({
				originalAssigneeId: 'alpha',
				replacementAssigneeId: 'bravo',
				replacementDisplay: expect.objectContaining({ lastName: 'Baker' }),
				countsTowardFuture: true,
				poolOverride: false
			})
		]);
		expect(nextPreview.rosterRows).toEqual([{ date: '2026-06-02', assigneeId: 'alpha' }]);
		expect(auditEvents).toContainEqual(
			expect.objectContaining({
				action: 'duty_roster_template_run.corrected',
				resourceType: 'duty_roster_template_run',
				resourceId: applied.acceptedRun.id,
				details: expect.objectContaining({
					poolOverride: false,
					poolOverrideReasons: []
				})
			})
		);
	});

	it('allows outside-pool correction overrides without adding the replacement to future candidates', async () => {
		const ctx = createCtx(createAuth({ scopeSet: { kind: 'groups', groupIds: ['alpha', 'bravo'] } }));
		personnelRows.push(
			personnelRow({ id: 'alpha', rank: 'SGT', last_name: 'Able', first_name: 'Ann', group_id: 'alpha' }),
			personnelRow({ id: 'bravo', rank: 'SGT', last_name: 'Baker', first_name: 'Ben', group_id: 'alpha' }),
			personnelRow({ id: 'charlie', rank: 'SGT', last_name: 'Cole', first_name: 'Cam', group_id: 'bravo' })
		);
		const template = await createConfiguredDutyRosterTemplate(ctx, {
			name: 'CQ NCO',
			shortCode: 'CQ',
			poolCriteria: {
				rankValues: ['SGT'],
				groupIds: ['alpha'],
				mosValues: [],
				dutyRoleValues: []
			},
			exemptPersonnelIds: [],
			manualBaselineCounts: {}
		});
		const preview = await generateDutyRosterTemplatePreview(ctx, {
			templateId: template.id,
			startDate: '2026-06-01',
			endDate: '2026-06-01'
		});
		const applied = await acceptAndApplyDutyRosterTemplatePreview(ctx, {
			preview: JSON.stringify(preview)
		});

		const correction = await recordDutyRosterTemplateRunCorrection(ctx, {
			runId: applied.acceptedRun.id,
			runRowDate: '2026-06-01',
			replacementAssigneeId: 'charlie',
			reason: 'Commander directed alternate Soldier.'
		});
		const listedRuns = await listAcceptedDutyRosterTemplateRuns(ctx, template.id);
		const nextPreview = await generateDutyRosterTemplatePreview(ctx, {
			templateId: template.id,
			startDate: '2026-06-02',
			endDate: '2026-06-02'
		});

		expect(correction).toMatchObject({
			replacementAssigneeId: 'charlie',
			poolOverride: true,
			poolOverrideReasons: ['outside-pool'],
			countsTowardFuture: true
		});
		expect(listedRuns[0].corrections).toEqual([
			expect.objectContaining({
				replacementAssigneeId: 'charlie',
				replacementDisplay: expect.objectContaining({ lastName: 'Cole' }),
				poolOverride: true,
				poolOverrideReasons: ['outside-pool']
			})
		]);
		expect(nextPreview.personnel.map((person) => person.id)).toEqual(['alpha', 'bravo']);
		expect(nextPreview.rosterRows[0]?.assigneeId).not.toBe('charlie');
		expect(auditEvents).toContainEqual(
			expect.objectContaining({
				action: 'duty_roster_template_run.corrected',
				details: expect.objectContaining({
					poolOverride: true,
					poolOverrideReasons: ['outside-pool']
				})
			})
		);
	});

	it('allows duty-specific exempt correction overrides with required reason metadata', async () => {
		const ctx = createCtx(createAuth({ scopeSet: { kind: 'groups', groupIds: ['alpha'] } }));
		personnelRows.push(
			personnelRow({ id: 'alpha', rank: 'SGT', last_name: 'Able', first_name: 'Ann', group_id: 'alpha' }),
			personnelRow({ id: 'bravo', rank: 'SGT', last_name: 'Baker', first_name: 'Ben', group_id: 'alpha' }),
			personnelRow({ id: 'charlie', rank: 'SGT', last_name: 'Cole', first_name: 'Cam', group_id: 'alpha' })
		);
		const template = await createConfiguredDutyRosterTemplate(ctx, {
			name: 'CQ NCO',
			shortCode: 'CQ',
			poolCriteria: {
				rankValues: ['SGT'],
				groupIds: ['alpha'],
				mosValues: [],
				dutyRoleValues: []
			},
			exemptPersonnelIds: ['charlie'],
			manualBaselineCounts: {}
		});
		const preview = await generateDutyRosterTemplatePreview(ctx, {
			templateId: template.id,
			startDate: '2026-06-01',
			endDate: '2026-06-01'
		});
		const accepted = await acceptDutyRosterTemplatePreview(ctx, {
			preview: JSON.stringify(preview)
		});

		const correction = await recordDutyRosterTemplateRunCorrection(ctx, {
			runId: accepted.id,
			runRowDate: '2026-06-01',
			replacementAssigneeId: 'charlie',
			reason: 'Commander approved exempt Soldier.'
		});

		expect(correction).toMatchObject({
			replacementAssigneeId: 'charlie',
			poolOverride: true,
			poolOverrideReasons: ['exempt']
		});
		expect(auditEvents).toContainEqual(
			expect.objectContaining({
				action: 'duty_roster_template_run.corrected',
				details: expect.objectContaining({
					poolOverride: true,
					poolOverrideReasons: ['exempt']
				})
			})
		);
	});

	it('records corrections before the accepted run has been applied to Calendar', async () => {
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
		const accepted = await acceptDutyRosterTemplatePreview(ctx, {
			preview: JSON.stringify(preview)
		});

		const correction = await recordDutyRosterTemplateRunCorrection(ctx, {
			runId: accepted.id,
			runRowDate: '2026-06-01',
			replacementAssigneeId: 'bravo',
			reason: 'Emergency leave swap.'
		});

		expect(correction).toMatchObject({
			runId: accepted.id,
			originalAssigneeId: 'alpha',
			replacementAssigneeId: 'bravo',
			countsTowardFuture: true
		});
		expect(correctionRows).toHaveLength(1);
		expect(dailyAssignmentRows).toHaveLength(0);
	});

	it('requires a correction reason', async () => {
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
		const accepted = await acceptDutyRosterTemplatePreview(ctx, {
			preview: JSON.stringify(preview)
		});

		await expect(
			recordDutyRosterTemplateRunCorrection(ctx, {
				runId: accepted.id,
				runRowDate: '2026-06-01',
				replacementAssigneeId: 'bravo',
				reason: '   '
			})
		).rejects.toMatchObject({
			status: 400,
			message: 'Correction reason is required'
		});
	});

	it('hard-blocks archived replacement Soldiers during correction', async () => {
		const ctx = createCtx();
		personnelRows.push(
			personnelRow({ id: 'alpha', rank: 'SGT', last_name: 'Able', first_name: 'Ann', group_id: 'alpha' }),
			personnelRow({
				id: 'bravo',
				rank: 'SGT',
				last_name: 'Baker',
				first_name: 'Ben',
				group_id: 'alpha',
				archived_at: '2026-05-01T00:00:00.000Z'
			})
		);
		const template = await createDutyRosterTemplate(ctx, { name: 'CQ NCO', shortCode: 'CQ' });
		const preview = await generateDutyRosterTemplatePreview(ctx, {
			templateId: template.id,
			startDate: '2026-06-01',
			endDate: '2026-06-01'
		});
		const accepted = await acceptDutyRosterTemplatePreview(ctx, {
			preview: JSON.stringify(preview)
		});

		await expect(
			recordDutyRosterTemplateRunCorrection(ctx, {
				runId: accepted.id,
				runRowDate: '2026-06-01',
				replacementAssigneeId: 'bravo',
				reason: 'Soldier performed duty.'
			})
		).rejects.toMatchObject({
			status: 400,
			message: 'Replacement Soldier is missing or archived.'
		});
		expect(correctionRows).toHaveLength(0);
	});

	it('updates applied Calendar assignments when recording a correction while preserving lineage', async () => {
		const ctx = createCtx(createAuth({ scopeSet: { kind: 'groups', groupIds: ['alpha'] } }));
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
		const applied = await acceptAndApplyDutyRosterTemplatePreview(ctx, {
			preview: JSON.stringify(preview)
		});

		await recordDutyRosterTemplateRunCorrection(ctx, {
			runId: applied.acceptedRun.id,
			runRowDate: '2026-06-01',
			replacementAssigneeId: 'bravo',
			reason: 'Soldier performed duty for original assignee.'
		});

		expect(dailyAssignmentRows).toEqual([
			expect.objectContaining({
				date: '2026-06-01',
				assignment_type_id: template.assignmentTypeId,
				assignee_id: 'bravo',
				duty_roster_template_run_id: applied.acceptedRun.id,
				duty_roster_template_run_row_date: '2026-06-01'
			})
		]);
	});

	it('rejects applied corrections when the replacement violates Duty Roster cooldown', async () => {
		const ctx = createCtx(createAuth({ scopeSet: { kind: 'groups', groupIds: ['alpha'] } }));
		personnelRows.push(
			personnelRow({ id: 'alpha', rank: 'SGT', last_name: 'Able', first_name: 'Ann', group_id: 'alpha' }),
			personnelRow({ id: 'bravo', rank: 'SGT', last_name: 'Baker', first_name: 'Ben', group_id: 'alpha' })
		);
		const template = await createDutyRosterTemplate(ctx, { name: 'CQ NCO', shortCode: 'CQ' });
		const assignmentType = assignmentTypeRows.find((row) => row.id === template.assignmentTypeId);
		if (assignmentType) {
			assignmentType.cooldown_hours = 12;
		}
		const preview = await generateDutyRosterTemplatePreview(ctx, {
			templateId: template.id,
			startDate: '2026-06-01',
			endDate: '2026-06-01'
		});
		const applied = await acceptAndApplyDutyRosterTemplatePreview(ctx, {
			preview: JSON.stringify(preview)
		});
		dutyEventRows.push({
			id: 'duty-event-bravo',
			organization_id: 'org-1',
			template_id: 'staff-duty',
			template_name: 'Staff Duty',
			event_date: '2026-06-02',
			coverage_start: '2026-06-02T06:00:00',
			coverage_end: '2026-06-02T18:00:00',
			coverage_mode: 'timed',
			start_time: '06:00',
			end_time: '18:00',
			is_blocking: true,
			cooldown_hours: 0,
			fill_summary: {},
			collision_summary: {},
			rules_snapshot: {}
		});
		dutyEventSlotRows.push({
			id: 'duty-slot-bravo',
			organization_id: 'org-1',
			duty_event_id: 'duty-event-bravo',
			template_slot_id: 'slot-nco',
			role_label: 'NCO',
			slot_index: 0,
			assignee_id: 'bravo',
			assignment_source: 'generated',
			warning_state: 'none',
			fairness_confidence: 'high',
			selection_reason: null,
			unfilled_reason: null,
			sort_order: 0
		});

		await expect(
			recordDutyRosterTemplateRunCorrection(ctx, {
				runId: applied.acceptedRun.id,
				runRowDate: '2026-06-01',
				replacementAssigneeId: 'bravo',
				reason: 'Soldier performed duty for original assignee.'
			})
		).rejects.toMatchObject({
			status: 409,
			message:
				"SGT Baker has another duty beginning at 2026-06-02T06:00:00, which overlaps this duty's cooldown window ending 2026-06-02T11:59:59."
		});

		expect(correctionRows).toHaveLength(0);
		expect(dailyAssignmentRows).toEqual([
			expect.objectContaining({
				date: '2026-06-01',
				assignment_type_id: template.assignmentTypeId,
				assignee_id: 'alpha'
			})
		]);
	});

	it('allows applied corrections outside the Duty Roster cooldown window', async () => {
		const ctx = createCtx(createAuth({ scopeSet: { kind: 'groups', groupIds: ['alpha'] } }));
		personnelRows.push(
			personnelRow({ id: 'alpha', rank: 'SGT', last_name: 'Able', first_name: 'Ann', group_id: 'alpha' }),
			personnelRow({ id: 'bravo', rank: 'SGT', last_name: 'Baker', first_name: 'Ben', group_id: 'alpha' })
		);
		const template = await createDutyRosterTemplate(ctx, { name: 'CQ NCO', shortCode: 'CQ' });
		const assignmentType = assignmentTypeRows.find((row) => row.id === template.assignmentTypeId);
		if (assignmentType) {
			assignmentType.cooldown_hours = 12;
		}
		const preview = await generateDutyRosterTemplatePreview(ctx, {
			templateId: template.id,
			startDate: '2026-06-01',
			endDate: '2026-06-01'
		});
		const applied = await acceptAndApplyDutyRosterTemplatePreview(ctx, {
			preview: JSON.stringify(preview)
		});

		await recordDutyRosterTemplateRunCorrection(ctx, {
			runId: applied.acceptedRun.id,
			runRowDate: '2026-06-01',
			replacementAssigneeId: 'bravo',
			reason: 'Soldier performed duty for original assignee.'
		});

		expect(correctionRows).toHaveLength(1);
		expect(dailyAssignmentRows).toEqual([
			expect.objectContaining({
				date: '2026-06-01',
				assignment_type_id: template.assignmentTypeId,
				assignee_id: 'bravo',
				duty_roster_template_run_id: applied.acceptedRun.id,
				duty_roster_template_run_row_date: '2026-06-01'
			})
		]);
	});

	it('rolls back correction history when applied Calendar assignment sync fails', async () => {
		const ctx = createCtx(createAuth({ scopeSet: { kind: 'groups', groupIds: ['alpha'] } }));
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
		const applied = await acceptAndApplyDutyRosterTemplatePreview(ctx, {
			preview: JSON.stringify(preview)
		});
		const deleteWhereAnySpy = vi
			.spyOn(store, 'deleteWhereAny')
			.mockRejectedValueOnce(new Error('Calendar sync failed.'));

		await expect(
			recordDutyRosterTemplateRunCorrection(ctx, {
				runId: applied.acceptedRun.id,
				runRowDate: '2026-06-01',
				replacementAssigneeId: 'bravo',
				reason: 'Soldier performed duty for original assignee.'
			})
		).rejects.toThrow('Calendar sync failed.');

		expect(correctionRows).toHaveLength(0);
		expect(dailyAssignmentRows).toEqual([
			expect.objectContaining({
				date: '2026-06-01',
				assignment_type_id: template.assignmentTypeId,
				assignee_id: 'alpha'
			})
		]);
		expect(
			auditEvents.some(
				(event) => event.action === 'duty_roster_template_run.corrected' && event.resourceId === applied.acceptedRun.id
			)
		).toBe(false);

		deleteWhereAnySpy.mockRestore();

		const nextPreview = await generateDutyRosterTemplatePreview(ctx, {
			templateId: template.id,
			startDate: '2026-06-02',
			endDate: '2026-06-02'
		});

		expect(nextPreview.rosterRows).toEqual([{ date: '2026-06-02', assigneeId: 'bravo' }]);
	});

	it('rejects duplicate no-op corrections against the current effective Soldier', async () => {
		const ctx = createCtx(createAuth({ scopeSet: { kind: 'groups', groupIds: ['alpha'] } }));
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
		const applied = await acceptAndApplyDutyRosterTemplatePreview(ctx, {
			preview: JSON.stringify(preview)
		});
		await recordDutyRosterTemplateRunCorrection(ctx, {
			runId: applied.acceptedRun.id,
			runRowDate: '2026-06-01',
			replacementAssigneeId: 'bravo',
			reason: 'Soldier performed duty for original assignee.'
		});

		await expect(
			recordDutyRosterTemplateRunCorrection(ctx, {
				runId: applied.acceptedRun.id,
				runRowDate: '2026-06-01',
				replacementAssigneeId: 'bravo',
				reason: 'Duplicate correction.'
			})
		).rejects.toMatchObject({
			status: 400,
			message: 'Replacement Soldier must differ from the current Soldier.'
		});
		expect(correctionRows).toHaveLength(1);
	});

	it('keeps corrections visible but non-counting when the parent run is invalidated', async () => {
		const ctx = createCtx(createAuth({ scopeSet: { kind: 'groups', groupIds: ['alpha'] } }));
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
		const applied = await acceptAndApplyDutyRosterTemplatePreview(ctx, {
			preview: JSON.stringify(preview)
		});
		await recordDutyRosterTemplateRunCorrection(ctx, {
			runId: applied.acceptedRun.id,
			runRowDate: '2026-06-01',
			replacementAssigneeId: 'bravo',
			reason: 'Emergency leave swap.'
		});

		await invalidateLatestDutyRosterTemplateRun(ctx, { runId: applied.acceptedRun.id });
		const listedRuns = await listAcceptedDutyRosterTemplateRuns(ctx, template.id);
		const nextPreview = await generateDutyRosterTemplatePreview(ctx, {
			templateId: template.id,
			startDate: '2026-06-02',
			endDate: '2026-06-02'
		});

		expect(listedRuns[0]).toMatchObject({
			id: applied.acceptedRun.id,
			status: 'invalidated',
			corrections: [expect.objectContaining({ replacementAssigneeId: 'bravo', countsTowardFuture: false })]
		});
		expect(nextPreview.rosterRows).toEqual([{ date: '2026-06-02', assigneeId: 'alpha' }]);
	});

	it('invalidates the latest accepted run and excludes it from future count derivation', async () => {
		const ctx = createCtx();
		personnelRows.push(
			personnelRow({ id: 'alpha', rank: 'SGT', last_name: 'Able', first_name: 'Ann', group_id: 'alpha' }),
			personnelRow({ id: 'bravo', rank: 'SGT', last_name: 'Baker', first_name: 'Ben', group_id: 'alpha' })
		);
		const template = await createDutyRosterTemplate(ctx, { name: 'CQ NCO', shortCode: 'CQ' });
		const firstPreview = await generateDutyRosterTemplatePreview(ctx, {
			templateId: template.id,
			startDate: '2026-06-01',
			endDate: '2026-06-01'
		});
		const firstRun = await acceptDutyRosterTemplatePreview(ctx, {
			preview: JSON.stringify(firstPreview)
		});
		acceptedRunRows[0].accepted_at = '2026-06-01T00:00:00.000Z';
		const secondPreview = await generateDutyRosterTemplatePreview(ctx, {
			templateId: template.id,
			startDate: '2026-06-02',
			endDate: '2026-06-02'
		});
		const secondRun = await acceptDutyRosterTemplatePreview(ctx, {
			preview: JSON.stringify(secondPreview)
		});
		acceptedRunRows[1].accepted_at = '2026-06-02T00:00:00.000Z';

		const result = await invalidateLatestDutyRosterTemplateRun(ctx, { runId: secondRun.id });
		const listedRuns = await listAcceptedDutyRosterTemplateRuns(ctx, template.id);
		const nextPreview = await generateDutyRosterTemplatePreview(ctx, {
			templateId: template.id,
			startDate: '2026-06-03',
			endDate: '2026-06-03'
		});

		expect(result.invalidatedRun).toMatchObject({
			id: secondRun.id,
			status: 'invalidated',
			invalidatedAt: expect.any(String),
			invalidatedByUserId: 'user-1'
		});
		expect(listedRuns.map((run) => ({ id: run.id, status: run.status }))).toEqual([
			{ id: secondRun.id, status: 'invalidated' },
			{ id: firstRun.id, status: 'accepted' }
		]);
		expect(nextPreview.rosterRows).toEqual([{ date: '2026-06-03', assigneeId: 'bravo' }]);
		expect(auditEvents).toContainEqual(
			expect.objectContaining({
				action: 'duty_roster_template_run.invalidated',
				resourceType: 'duty_roster_template_run',
				resourceId: secondRun.id
			})
		);
	});

	it('invalidates an older future accepted run without invalidating follow-on runs', async () => {
		const ctx = createCtx();
		personnelRows.push(
			personnelRow({ id: 'alpha', rank: 'SGT', last_name: 'Able', first_name: 'Ann', group_id: 'alpha' }),
			personnelRow({ id: 'bravo', rank: 'SGT', last_name: 'Baker', first_name: 'Ben', group_id: 'alpha' })
		);
		const template = await createDutyRosterTemplate(ctx, { name: 'CQ NCO', shortCode: 'CQ' });
		const firstPreview = await generateDutyRosterTemplatePreview(ctx, {
			templateId: template.id,
			startDate: '2026-06-01',
			endDate: '2026-06-01'
		});
		const firstRun = await acceptDutyRosterTemplatePreview(ctx, {
			preview: JSON.stringify(firstPreview)
		});
		acceptedRunRows[0].accepted_at = '2026-06-01T00:00:00.000Z';
		const secondPreview = await generateDutyRosterTemplatePreview(ctx, {
			templateId: template.id,
			startDate: '2026-06-02',
			endDate: '2026-06-02'
		});
		await acceptDutyRosterTemplatePreview(ctx, {
			preview: JSON.stringify(secondPreview)
		});
		acceptedRunRows[1].accepted_at = '2026-06-02T00:00:00.000Z';

		const result = await invalidateLatestDutyRosterTemplateRun(ctx, { runId: firstRun.id });
		const listedRuns = await listAcceptedDutyRosterTemplateRuns(ctx, template.id);

		expect(result.invalidatedRun).toMatchObject({
			id: firstRun.id,
			status: 'invalidated'
		});
		expect(listedRuns.map((run) => ({ id: run.id, status: run.status }))).toEqual([
			{ id: 'run-2', status: 'accepted' },
			{ id: firstRun.id, status: 'invalidated' }
		]);
	});

	it('invalidates selected and follow-on accepted runs when cascade is requested', async () => {
		const ctx = createCtx();
		personnelRows.push(
			personnelRow({ id: 'alpha', rank: 'SGT', last_name: 'Able', first_name: 'Ann', group_id: 'alpha' }),
			personnelRow({ id: 'bravo', rank: 'SGT', last_name: 'Baker', first_name: 'Ben', group_id: 'alpha' })
		);
		const template = await createDutyRosterTemplate(ctx, { name: 'CQ NCO', shortCode: 'CQ' });
		for (const [index, date] of ['2026-06-01', '2026-06-02', '2026-06-03'].entries()) {
			const preview = await generateDutyRosterTemplatePreview(ctx, {
				templateId: template.id,
				startDate: date,
				endDate: date
			});
			await acceptDutyRosterTemplatePreview(ctx, {
				preview: JSON.stringify(preview)
			});
			acceptedRunRows[index].accepted_at = `2026-06-0${index + 1}T00:00:00.000Z`;
		}

		const result = await invalidateLatestDutyRosterTemplateRun(ctx, { runId: 'run-1', cascade: true });
		const listedRuns = await listAcceptedDutyRosterTemplateRuns(ctx, template.id);

		expect(result.invalidatedRuns.map((run) => run.id)).toEqual(['run-1', 'run-2', 'run-3']);
		expect(listedRuns.map((run) => ({ id: run.id, status: run.status }))).toEqual([
			{ id: 'run-3', status: 'invalidated' },
			{ id: 'run-2', status: 'invalidated' },
			{ id: 'run-1', status: 'invalidated' }
		]);
	});

	it('blocks invalidating runs whose end date is before today', async () => {
		const ctx = createCtx();
		vi.setSystemTime(new Date('2026-06-02T12:00:00.000Z'));
		personnelRows.push(
			personnelRow({ id: 'alpha', rank: 'SGT', last_name: 'Able', first_name: 'Ann', group_id: 'alpha' })
		);
		const template = await createDutyRosterTemplate(ctx, { name: 'CQ NCO', shortCode: 'CQ' });
		const preview = await generateDutyRosterTemplatePreview(ctx, {
			templateId: template.id,
			startDate: '2026-06-02',
			endDate: '2026-06-02'
		});
		const run = await acceptDutyRosterTemplatePreview(ctx, {
			preview: JSON.stringify(preview)
		});
		acceptedRunRows[0].end_date = '2026-06-01';

		await expect(invalidateLatestDutyRosterTemplateRun(ctx, { runId: run.id })).rejects.toMatchObject({
			status: 400,
			message: 'Duty Roster Run has ended and can no longer be invalidated.'
		});
	});

	it('rechecks selected run status immediately before invalidation writes', async () => {
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
		const run = await acceptDutyRosterTemplatePreview(ctx, {
			preview: JSON.stringify(preview)
		});
		const originalFindMany = store.findMany.bind(store);
		let runChecks = 0;
		const findManySpy = vi.spyOn(store, 'findMany').mockImplementation(async (table, orgId, filters, options) => {
			if (table === 'duty_roster_template_runs' && filters?.template_id === template.id) {
				runChecks += 1;
				if (runChecks === 2) {
					acceptedRunRows[0].status = 'invalidated';
					acceptedRunRows[0].invalidated_at = '2026-05-04T12:01:00.000Z';
					acceptedRunRows[0].invalidated_by_user_id = 'user-2';
				}
			}
			return originalFindMany(table, orgId, filters, options);
		});

		await expect(invalidateLatestDutyRosterTemplateRun(ctx, { runId: run.id })).rejects.toMatchObject({
			status: 409,
			message: 'Duty Roster Run changed before invalidation. Refresh history and try again.'
		});

		expect(acceptedRunRows.find((row) => row.id === run.id)).toMatchObject({
			status: 'invalidated',
			invalidated_by_user_id: 'user-2'
		});
		expect(auditEvents).not.toContainEqual(
			expect.objectContaining({
				action: 'duty_roster_template_run.invalidated',
				resourceId: run.id
			})
		);
		findManySpy.mockRestore();
	});

	it('removes linked Calendar assignments when invalidating an applied run and reports edited rows', async () => {
		const ctx = createCtx(createAuth({ scopeSet: { kind: 'groups', groupIds: ['alpha'] } }));
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
		const applied = await acceptAndApplyDutyRosterTemplatePreview(ctx, {
			preview: JSON.stringify(preview)
		});
		dailyAssignmentRows[0].assignee_id = 'bravo';

		const result = await invalidateLatestDutyRosterTemplateRun(ctx, { runId: applied.acceptedRun.id });

		expect(result).toMatchObject({
			removedCalendarAssignments: 1,
			calendarAssignmentsEdited: true
		});
		expect(dailyAssignmentRows).toHaveLength(0);
		expect(auditEvents).toContainEqual(
			expect.objectContaining({
				action: 'duty_roster_template_run.invalidated',
				resourceType: 'duty_roster_template_run',
				resourceId: applied.acceptedRun.id
			})
		);
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
		expect(firstPreview.rosterRows).toEqual([{ date: '2026-06-01', assigneeId: 'bravo' }]);
		await acceptDutyRosterTemplatePreview(ctx, {
			preview: JSON.stringify(firstPreview)
		});

		const nextPreview = await generateDutyRosterTemplatePreview(ctx, {
			templateId: template.id,
			startDate: '2026-06-02',
			endDate: '2026-06-02'
		});

		expect(nextPreview.rosterRows).toEqual([{ date: '2026-06-02', assigneeId: 'alpha' }]);
	});

	it('reports Manual DA6 Baseline as the count read model until the first accepted run', async () => {
		const ctx = createCtx();
		personnelRows.push(
			personnelRow({ id: 'alpha', rank: 'SGT', last_name: 'Able', first_name: 'Ann', group_id: 'alpha' }),
			personnelRow({ id: 'bravo', rank: 'SGT', last_name: 'Baker', first_name: 'Ben', group_id: 'alpha' }),
			personnelRow({ id: 'charlie', rank: 'SGT', last_name: 'Charlie', first_name: 'Cal', group_id: 'alpha' })
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
			manualBaselineCounts: { bravo: 2, charlie: 1 }
		});

		const readModel = await loadDutyRosterTemplateCountReadModel(ctx, updated);

		expect(readModel).toMatchObject({
			source: 'manual-da6-baseline',
			sourceLabel: 'Manual DA6 Baseline',
			acceptedRunCount: 0,
			invalidatedRunCount: 0
		});
		expect(readModel.rows.map((row) => [row.personnelId, row.count])).toEqual([
			['alpha', 0],
			['bravo', 2],
			['charlie', 1]
		]);
	});

	it('derives count read models from manual accepted selections, corrections, and invalidated history', async () => {
		const ctx = createCtx(createAuth({ scopeSet: { kind: 'groups', groupIds: ['alpha'] } }));
		personnelRows.push(
			personnelRow({ id: 'alpha', rank: 'SGT', last_name: 'Able', first_name: 'Ann', group_id: 'alpha' }),
			personnelRow({ id: 'bravo', rank: 'SGT', last_name: 'Baker', first_name: 'Ben', group_id: 'alpha' }),
			personnelRow({ id: 'charlie', rank: 'SGT', last_name: 'Charlie', first_name: 'Cal', group_id: 'alpha' })
		);
		const template = await createDutyRosterTemplate(ctx, { name: 'CQ NCO', shortCode: 'CQ' });
		const firstPreview = await generateDutyRosterTemplatePreview(ctx, {
			templateId: template.id,
			startDate: '2026-06-01',
			endDate: '2026-06-01'
		});
		const manualFirstPreview = await applyDutyRosterTemplatePreviewManualSelection(ctx, {
			preview: JSON.stringify(firstPreview),
			date: '2026-06-01',
			assigneeId: 'bravo',
			reason: null
		});
		await acceptDutyRosterTemplatePreview(ctx, {
			preview: JSON.stringify(manualFirstPreview)
		});
		acceptedRunRows[0].accepted_at = '2026-06-01T00:00:00.000Z';
		const secondPreview = await generateDutyRosterTemplatePreview(ctx, {
			templateId: template.id,
			startDate: '2026-06-02',
			endDate: '2026-06-02'
		});
		const secondRun = await acceptAndApplyDutyRosterTemplatePreview(ctx, {
			preview: JSON.stringify(secondPreview)
		});
		acceptedRunRows[1].accepted_at = '2026-06-02T00:00:00.000Z';
		await recordDutyRosterTemplateRunCorrection(ctx, {
			runId: secondRun.acceptedRun.id,
			runRowDate: '2026-06-02',
			replacementAssigneeId: 'charlie',
			reason: 'Soldier performed duty for original assignee.'
		});

		const correctedReadModel = await loadDutyRosterTemplateCountReadModel(ctx, template);

		expect(correctedReadModel).toMatchObject({
			source: 'accepted-history',
			sourceLabel: 'Accepted history',
			acceptedRunCount: 2,
			invalidatedRunCount: 0,
			countingCorrectionCount: 1,
			nonCountingCorrectionCount: 0
		});
		expect(correctedReadModel.sourceDescription).toContain('Manual accepted selections');
		expect(correctedReadModel.sourceDescription).toContain('Latest counting corrections');
		expect(correctedReadModel.rows.map((row) => [row.personnelId, row.count, row.lastDutyDate])).toEqual([
			['alpha', 0, null],
			['bravo', 1, '2026-06-01'],
			['charlie', 1, '2026-06-02']
		]);

		await invalidateLatestDutyRosterTemplateRun(ctx, { runId: secondRun.acceptedRun.id });
		const invalidatedReadModel = await loadDutyRosterTemplateCountReadModel(ctx, template);

		expect(invalidatedReadModel).toMatchObject({
			source: 'accepted-history',
			acceptedRunCount: 1,
			invalidatedRunCount: 1,
			countingCorrectionCount: 0,
			nonCountingCorrectionCount: 1
		});
		expect(invalidatedReadModel.sourceDescription).toContain('Invalidated runs stay visible');
		expect(invalidatedReadModel.rows.map((row) => [row.personnelId, row.count, row.lastDutyDate])).toEqual([
			['alpha', 0, null],
			['bravo', 1, '2026-06-01'],
			['charlie', 0, null]
		]);
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

	it('loads accepted Duty Roster history in bounded pages', async () => {
		const ctx = createCtx();
		for (let index = 1; index <= 25; index += 1) {
			const day = String(index).padStart(2, '0');
			acceptedRunRows.push(
				acceptedRunRow({
					id: `run-${day}`,
					accepted_at: `2026-06-${day}T12:00:00.000Z`,
					created_at: `2026-06-${day}T12:00:00.000Z`
				})
			);
		}

		const firstPage = await listAcceptedDutyRosterTemplateRunHistory(ctx, 'template-1');
		const secondPage = await listAcceptedDutyRosterTemplateRunHistory(ctx, 'template-1', { page: 2 });

		expect(firstPage.runs).toHaveLength(20);
		expect(firstPage.runs[0]?.id).toBe('run-25');
		expect(firstPage.runs.at(-1)?.id).toBe('run-06');
		expect(firstPage).toMatchObject({
			page: 1,
			pageSize: 20,
			hasMore: true,
			nextPage: 2,
			previousPage: null,
			latestRunId: 'run-25'
		});
		expect(secondPage.runs.map((run) => run.id)).toEqual(['run-05', 'run-04', 'run-03', 'run-02', 'run-01']);
		expect(secondPage).toMatchObject({
			page: 2,
			hasMore: false,
			nextPage: null,
			previousPage: 1,
			latestRunId: 'run-25'
		});
	});

	it('includes a selected older Duty Roster history run without loading the full history', async () => {
		const ctx = createCtx();
		for (let index = 1; index <= 25; index += 1) {
			const day = String(index).padStart(2, '0');
			acceptedRunRows.push(
				acceptedRunRow({
					id: `run-${day}`,
					accepted_at: `2026-06-${day}T12:00:00.000Z`,
					created_at: `2026-06-${day}T12:00:00.000Z`
				})
			);
		}

		const page = await listAcceptedDutyRosterTemplateRunHistory(ctx, 'template-1', { includeRunId: 'run-01' });

		expect(page.runs).toHaveLength(21);
		expect(page.runs.map((run) => run.id)).toContain('run-01');
		expect(page.runs[0]?.id).toBe('run-25');
		expect(page.latestRunId).toBe('run-25');
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
			message: 'Manual DA6 Baseline is locked for Soldiers who already appeared in accepted history.'
		});
	});
});

function tableRows(table: string): Record<string, unknown>[] {
	switch (table) {
		case 'assignment_types':
			return assignmentTypeRows;
		case 'availability_entries':
			return availabilityRows;
		case 'daily_assignments':
			return dailyAssignmentRows;
		case 'duty_roster_template_runs':
			return acceptedRunRows;
		case 'duty_roster_template_run_corrections':
			return correctionRows;
		case 'duty_events':
			return dutyEventRows;
		case 'duty_event_slots':
			return dutyEventSlotRows;
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

function oversizedPreviewPayload(): string {
	return 'x'.repeat(2 * 1024 * 1024 + 1);
}

function acceptedRunSnapshotPayload(input: {
	templateId: string;
	templateName: string;
	acceptedAt?: string;
	personnelIds?: string[];
}): Record<string, unknown> {
	const personnel = (input.personnelIds ?? []).map((personnelId) => ({
		id: personnelId,
		rank: 'SGT',
		lastName: personnelId,
		firstName: 'Soldier',
		groupId: 'alpha',
		groupName: 'Alpha'
	}));

	return {
		snapshotVersion: 1,
		template: {
			id: input.templateId,
			name: input.templateName,
			shortCode: 'CQ'
		},
		generatedAt: '2026-06-01T00:00:00.000Z',
		acceptedAt: input.acceptedAt ?? '2026-06-01T12:00:00.000Z',
		acceptedByUserId: 'user-1',
		config: {
			startDate: '2026-06-01',
			endDate: '2026-06-01'
		},
		resolvedPool: personnel,
		selectionPersonnel: personnel.map((person) => ({ ...person, archivedAt: null })),
		generatedRows: [],
		finalRows: [],
		manualSelections: [],
		da6: { columns: [], rows: [] },
		exportModel: { title: 'CQ NCO', sequencePeriods: [], rows: [] },
		warnings: []
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
		snapshot_payload: acceptedRunSnapshotPayload({
			templateId: 'template-1',
			templateName: 'CQ NCO',
			acceptedAt: String(overrides.accepted_at ?? '2026-06-01T12:00:00.000Z')
		}),
		accepted_by_user_id: 'user-1',
		accepted_at: '2026-06-01T12:00:00.000Z',
		applied_by_user_id: null,
		applied_at: null,
		invalidated_by_user_id: null,
		invalidated_at: null,
		created_at: '2026-06-01T12:00:00.000Z',
		...overrides
	};
}
