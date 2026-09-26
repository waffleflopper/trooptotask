import { describe, expect, it, vi } from 'vitest';
import { createWritePortsContext } from '$lib/server/adapters/inMemory';
import { importIctCompletionsBatch } from './ictCompletionsBatch';

function buildContext(overrides?: Parameters<typeof createWritePortsContext>[0]) {
	return createWritePortsContext(overrides);
}

describe('importIctCompletionsBatch', () => {
	it('creates new completion history rows and updates exact same-date matches in one batch', async () => {
		const ctx = buildContext();
		ctx.store.seed('personnel', [
			{
				id: 'person-alpha',
				organization_id: 'test-org',
				rank: 'SGT',
				last_name: 'Smith',
				first_name: 'Jane',
				mos: '68W',
				clinic_role: 'Medic',
				group_id: 'group-alpha',
				archived_at: null
			},
			{
				id: 'person-leader',
				organization_id: 'test-org',
				rank: 'SFC',
				last_name: 'Smith',
				first_name: 'John',
				mos: '68W',
				clinic_role: 'Team Leader',
				group_id: 'group-alpha',
				archived_at: null
			}
		]);
		ctx.store.seed('ict_tasks', [
			{
				id: 'task-tccc',
				organization_id: 'test-org',
				task_code: '181-105-1001',
				title: 'Perform tactical combat casualty care',
				description: null,
				mos: ['68W'],
				expiration_months: 12,
				sort_order: 1,
				archived_at: null,
				created_at: '2026-04-01T00:00:00Z'
			},
			{
				id: 'task-airway',
				organization_id: 'test-org',
				task_code: '081-833-0010',
				title: 'Open an airway',
				description: null,
				mos: ['68W'],
				expiration_months: 12,
				sort_order: 2,
				archived_at: null,
				created_at: '2026-04-01T00:00:00Z'
			}
		]);
		ctx.store.seed('personnel_ict_completions', [
			{
				id: 'completion-existing',
				organization_id: 'test-org',
				personnel_id: 'person-alpha',
				ict_task_id: 'task-tccc',
				completed_at: '2026-03-01',
				validation_method: 'Lecture',
				validated_by: 'MSG Example',
				notes: 'Old note',
				logged_by: 'user-1',
				created_at: '2026-03-01T12:00:00Z'
			}
		]);

		const result = await importIctCompletionsBatch(ctx, {
			records: [
				{
					rowNumber: 2,
					values: {
						rank: 'SGT',
						lastName: 'Smith',
						firstName: 'Jane',
						taskCode: '181-105-1001',
						completedAt: '2026-03-01',
						validationMethod: 'Practical Exercise',
						validatedBy: 'SFC Taylor Example',
						notes: 'Updated note'
					}
				},
				{
					rowNumber: 3,
					values: {
						rank: 'SFC',
						lastName: 'Smith',
						firstName: 'John',
						taskCode: '081-833-0010',
						completedAt: '2026-04-15'
					}
				}
			]
		});

		expect(result.errors).toEqual([]);
		expect(result.updated).toEqual([
			expect.objectContaining({
				id: 'completion-existing',
				personnelId: 'person-alpha',
				ictTaskId: 'task-tccc',
				completedAt: '2026-03-01',
				validationMethod: 'Practical Exercise',
				validatedBy: 'SFC Taylor Example',
				notes: 'Updated note'
			})
		]);
		expect(result.inserted).toEqual([
			expect.objectContaining({
				personnelId: 'person-leader',
				ictTaskId: 'task-airway',
				completedAt: '2026-04-15',
				validationMethod: 'Other',
				validatedBy: null,
				notes: null
			})
		]);
		expect(ctx.audit.events).toEqual([
			expect.objectContaining({
				action: 'personnel_ict_completion.bulk_imported',
				resourceType: 'personnel_ict_completion',
				details: {
					inserted: 1,
					updated: 1,
					errors: 0
				}
			})
		]);
	});

	it('returns invalid and ambiguous rows as import errors without writing them', async () => {
		const ctx = buildContext();
		ctx.store.seed('personnel', [
			{
				id: 'person-alpha',
				organization_id: 'test-org',
				rank: 'SGT',
				last_name: 'Smith',
				first_name: 'Jane',
				mos: '68W',
				clinic_role: 'Medic',
				group_id: 'group-alpha',
				archived_at: null
			},
			{
				id: 'person-bravo',
				organization_id: 'test-org',
				rank: 'SPC',
				last_name: 'Smith',
				first_name: 'Jane',
				mos: '68W',
				clinic_role: 'Medic',
				group_id: 'group-bravo',
				archived_at: null
			}
		]);
		ctx.store.seed('ict_tasks', [
			{
				id: 'task-tccc',
				organization_id: 'test-org',
				task_code: '181-105-1001',
				title: 'Perform tactical combat casualty care',
				description: null,
				mos: ['68W'],
				expiration_months: 12,
				sort_order: 1,
				archived_at: null,
				created_at: '2026-04-01T00:00:00Z'
			},
			{
				id: 'task-archived',
				organization_id: 'test-org',
				task_code: '181-105-1999',
				title: 'Archived task',
				description: null,
				mos: ['68W'],
				expiration_months: 12,
				sort_order: 2,
				archived_at: '2026-04-14T12:00:00Z',
				created_at: '2026-04-01T00:00:00Z'
			}
		]);

		const result = await importIctCompletionsBatch(ctx, {
			records: [
				{
					rowNumber: 2,
					values: {
						lastName: 'Smith',
						firstName: 'Jane',
						taskCode: '181-105-1001',
						completedAt: '2026-04-15'
					}
				},
				{
					rowNumber: 3,
					values: {
						rank: 'SGT',
						lastName: 'Smith',
						firstName: 'Jane',
						taskCode: 'BAD-TASK',
						completedAt: '2026-04-15'
					}
				},
				{
					rowNumber: 4,
					values: {
						rank: 'SGT',
						lastName: 'Smith',
						firstName: 'Jane',
						taskCode: '181-105-1999',
						completedAt: '2026-04-15'
					}
				}
			]
		});

		expect(result.inserted).toEqual([]);
		expect(result.updated).toEqual([]);
		expect(result.errors).toEqual([
			{
				rowNumber: 2,
				personnelName: 'Jane Smith',
				taskCode: '181-105-1001',
				message: 'Multiple personnel records match this row. Add rank or correct the name values.'
			},
			{
				rowNumber: 3,
				personnelName: 'SGT Jane Smith',
				taskCode: 'BAD-TASK',
				message: 'Task code "BAD-TASK" does not match an existing critical task'
			},
			{
				rowNumber: 4,
				personnelName: 'SGT Jane Smith',
				taskCode: '181-105-1999',
				message: 'Task code "181-105-1999" is archived and cannot receive new completion imports'
			}
		]);

		const stored = await ctx.store.findMany<{ id: string }>('personnel_ict_completions', 'test-org');
		expect(stored).toEqual([]);
	});

	it('returns archived personnel rows as import errors without writing them', async () => {
		const ctx = buildContext();
		ctx.store.seed('personnel', [
			{
				id: 'person-archived',
				organization_id: 'test-org',
				rank: 'SGT',
				last_name: 'Smith',
				first_name: 'Jane',
				mos: '68W',
				clinic_role: 'Medic',
				group_id: 'group-alpha',
				archived_at: '2026-04-14T12:00:00Z'
			}
		]);
		ctx.store.seed('ict_tasks', [
			{
				id: 'task-tccc',
				organization_id: 'test-org',
				task_code: '181-105-1001',
				title: 'Perform tactical combat casualty care',
				description: null,
				mos: ['68W'],
				expiration_months: 12,
				sort_order: 1,
				archived_at: null,
				created_at: '2026-04-01T00:00:00Z'
			}
		]);

		const result = await importIctCompletionsBatch(ctx, {
			records: [
				{
					rowNumber: 2,
					values: {
						rank: 'SGT',
						lastName: 'Smith',
						firstName: 'Jane',
						taskCode: '181-105-1001',
						completedAt: '2026-04-15'
					}
				}
			]
		});

		expect(result.inserted).toEqual([]);
		expect(result.updated).toEqual([]);
		expect(result.errors).toEqual([
			{
				rowNumber: 2,
				personnelName: 'SGT Jane Smith',
				taskCode: '181-105-1001',
				message: 'Personnel record is archived and cannot receive new completion imports.'
			}
		]);

		const stored = await ctx.store.findMany<{ id: string }>('personnel_ict_completions', 'test-org');
		expect(stored).toEqual([]);
	});

	it('imports for a Critical Tasks-only Group operator without a request-store Personnel read', async () => {
		const ctx = buildContext({
			auth: {
				role: 'member',
				isPrivileged: false,
				scopeSet: { kind: 'groups', groupIds: ['group-alpha'] },
				capabilityMap: {
					calendar: 'none',
					personnel: 'none',
					training: 'none',
					criticalTasks: 'operate',
					onboarding: 'none',
					ratingScheme: 'none'
				}
			}
		});
		ctx.store.seed('personnel', [
			{
				id: 'person-alpha',
				organization_id: 'test-org',
				rank: 'SGT',
				last_name: 'Smith',
				first_name: 'Jane',
				mos: '68W',
				clinic_role: 'Medic',
				group_id: 'group-alpha',
				archived_at: null
			}
		]);
		ctx.store.seed('ict_tasks', [
			{
				id: 'task-tccc',
				organization_id: 'test-org',
				task_code: '181-105-1001',
				title: 'Perform tactical combat casualty care',
				description: null,
				mos: ['68W'],
				expiration_months: 12,
				sort_order: 1,
				archived_at: null,
				created_at: '2026-04-01T00:00:00Z'
			}
		]);
		const requestFindMany = ctx.store.findMany.bind(ctx.store);
		vi.spyOn(ctx.store, 'findMany').mockImplementation((...args) => {
			if (args[0] === 'personnel') throw new Error('Personnel SELECT denied for this request');
			return requestFindMany(...args);
		});

		const result = await importIctCompletionsBatch(ctx, {
			records: [
				{
					rowNumber: 2,
					values: {
						rank: 'SGT',
						lastName: 'Smith',
						firstName: 'Jane',
						taskCode: '181-105-1001',
						completedAt: '2026-04-15'
					}
				}
			]
		});

		expect(result.errors).toEqual([]);
		expect(result.inserted).toHaveLength(1);

		const stored = await ctx.store.findMany<{ id: string }>('personnel_ict_completions', 'test-org');
		expect(stored).toHaveLength(1);
	});

	it('keeps successful rows and reports exact failed rows when bulk insert falls back', async () => {
		const ctx = buildContext();
		ctx.store.seed('personnel', [
			{
				id: 'person-allowed',
				organization_id: 'test-org',
				rank: 'SGT',
				first_name: 'Amy',
				last_name: 'Able',
				group_id: 'group-alpha',
				archived_at: null
			},
			{
				id: 'person-rejected',
				organization_id: 'test-org',
				rank: 'SPC',
				first_name: 'Ben',
				last_name: 'Baker',
				group_id: 'group-alpha',
				archived_at: null
			}
		]);
		ctx.store.seed('ict_tasks', [
			{
				id: 'task-1',
				organization_id: 'test-org',
				task_code: 'T-1',
				title: 'Task One',
				mos: [],
				archived_at: null
			}
		]);
		vi.spyOn(ctx.store, 'insertMany').mockRejectedValueOnce(new Error('bulk insert unavailable'));
		const storeInsert = ctx.store.insert.bind(ctx.store);
		vi.spyOn(ctx.store, 'insert').mockImplementation((...args) => {
			if ((args[2] as Record<string, unknown>).personnel_id === 'person-rejected') {
				throw new Error('row rejected');
			}
			return storeInsert(...args);
		});

		const result = await importIctCompletionsBatch(ctx, {
			records: [
				{
					rowNumber: 2,
					values: { rank: 'SGT', firstName: 'Amy', lastName: 'Able', taskCode: 'T-1', completedAt: '2026-04-15' }
				},
				{
					rowNumber: 3,
					values: { rank: 'SPC', firstName: 'Ben', lastName: 'Baker', taskCode: 'T-1', completedAt: '2026-04-15' }
				}
			]
		});

		expect(result.inserted).toEqual([expect.objectContaining({ personnelId: 'person-allowed' })]);
		expect(result.updated).toEqual([]);
		expect(result.errors).toEqual([
			{ rowNumber: 3, personnelName: 'SPC Ben Baker', taskCode: 'T-1', message: 'row rejected' }
		]);
		expect(await ctx.store.findMany('personnel_ict_completions', 'test-org')).toEqual([
			expect.objectContaining({ personnel_id: 'person-allowed' })
		]);
		expect(ctx.audit.events).toEqual([expect.objectContaining({ details: { inserted: 1, updated: 0, errors: 1 } })]);
	});
});
