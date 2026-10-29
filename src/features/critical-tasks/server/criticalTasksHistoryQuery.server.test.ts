import { groupCoverageForTest } from '$lib/access/test-support/groupCoverage';
import { createSupabaseCriticalTaskLibraryPersistence } from './criticalTaskLibraryPersistence.server';
import { createClient } from '@supabase/supabase-js';
import { createSupabaseCriticalTaskCompletionPersistence } from './criticalTaskCompletionPersistence.server';
import { describe, expect, it } from 'vitest';
import { createTestContext } from './criticalTasksPersistence.test-support.server';
import { fetchCriticalTasksPersonnelHistory } from './criticalTasksHistoryQuery.server';

describe('fetchCriticalTasksPersonnelHistory', () => {
	it('returns completion history with archived ICT task metadata intact', async () => {
		const ctx = createTestContext({
			auth: {
				role: 'member',
				isPrivileged: false,
				scopeSet: groupCoverageForTest({ kind: 'groups', groupIds: ['group-a'] }),
				capabilityMap: {
					calendar: 'none',
					personnel: 'none',
					training: 'none',
					criticalTasks: 'view',
					onboarding: 'none',
					ratingScheme: 'none'
				}
			}
		});
		ctx.store.seed('personnel', [
			{
				id: 'p-1',
				organization_id: 'test-org',
				rank: 'SGT',
				first_name: 'Jane',
				last_name: 'Smith',
				mos: '68W',
				clinic_role: 'Medic',
				group_id: 'group-a',
				archived_at: null
			}
		]);
		ctx.store.seed('ict_tasks', [
			{
				id: 'task-active',
				organization_id: 'test-org',
				task_code: '181-105-1001',
				title: 'Perform tactical combat casualty care',
				description: null,
				mos: ['68W'],
				expiration_months: 12,
				sort_order: 0,
				archived_at: null,
				created_at: '2026-04-01T12:00:00Z'
			},
			{
				id: 'task-archived',
				organization_id: 'test-org',
				task_code: '181-105-1002',
				title: 'Evacuate casualty',
				description: null,
				mos: ['68W'],
				expiration_months: 12,
				sort_order: 1,
				archived_at: '2026-04-14T12:00:00Z',
				created_at: '2026-04-01T12:00:00Z'
			}
		]);
		ctx.store.seed('personnel_ict_completions', [
			{
				id: 'completion-active',
				organization_id: 'test-org',
				personnel_id: 'p-1',
				ict_task_id: 'task-active',
				completed_at: '2026-04-01',
				validation_method: 'Lecture',
				validated_by: 'SFC Jones',
				notes: null,
				logged_by: 'user-1',
				created_at: '2026-04-01T12:00:00Z'
			},
			{
				id: 'completion-archived',
				organization_id: 'test-org',
				personnel_id: 'p-1',
				ict_task_id: 'task-archived',
				completed_at: '2026-04-02',
				validation_method: 'Practical Exercise',
				validated_by: 'SFC Jones',
				notes: 'Lane validation',
				logged_by: 'user-1',
				created_at: '2026-04-02T12:00:00Z'
			}
		]);
		const requestFindOne = ctx.store.findOne.bind(ctx.store);
		ctx.store.findOne = ((table, orgId, filters, select) =>
			table === 'personnel'
				? Promise.reject(new Error('Personnel SELECT denied for this Critical Tasks-only actor'))
				: requestFindOne(table, orgId, filters, select)) as typeof ctx.store.findOne;

		const result = await fetchCriticalTasksPersonnelHistory(ctx, 'p-1');

		expect(result.personnel.lastName).toBe('Smith');
		expect(result.rows.map((row) => row.completion.id)).toEqual(['completion-archived', 'completion-active']);
		expect(result.rows[0]).toMatchObject({
			taskCode: '181-105-1002',
			taskTitle: 'Evacuate casualty',
			taskArchivedAt: '2026-04-14T12:00:00Z'
		});
		expect(result.rows[1]).toMatchObject({
			taskCode: '181-105-1001',
			taskArchivedAt: null
		});
	});

	it('denies out-of-scope personnel history through scoped store reads', async () => {
		const ctx = createTestContext({
			auth: { scopeSet: groupCoverageForTest({ kind: 'groups', groupIds: ['group-a'] }) }
		});
		ctx.store.seed('personnel', [
			{
				id: 'p-outside',
				organization_id: 'test-org',
				rank: 'SGT',
				first_name: 'Bob',
				last_name: 'Bravo',
				mos: '68W',
				clinic_role: 'Medic',
				group_id: 'group-b',
				archived_at: null
			}
		]);

		await expect(fetchCriticalTasksPersonnelHistory(ctx, 'p-outside')).rejects.toMatchObject({
			status: 404
		});
	});
});

describe('wide retained task metadata', () => {
	it('returns all dated rows and archived metadata without an oversized task lookup', async () => {
		const ctx = createTestContext();
		const ids = Array.from({ length: 501 }, (_, i) => `30000000-0000-4000-8000-${String(i).padStart(12, '0')}`);
		const completions = ids.map((id, i) => ({
			id: `completion-${i}`,
			personnel_id: 'person-history',
			ict_task_id: id,
			completed_at: '2026-03-15',
			validation_method: 'Demonstration',
			validated_by: null,
			notes: `date-${i}`,
			logged_by: null,
			created_at: '2026-03-15T12:00:00Z'
		}));
		const tasks = ids.map((id, i) => ({
			id,
			task_code: `HISTORY-${i}`,
			title: `Retained task ${i}`,
			mos: [],
			archived_at: i === 500 ? '2026-03-16T12:00:00Z' : null,
			created_at: '2026-01-01T12:00:00Z'
		}));
		const person = { id: 'person-history', firstName: 'Synthetic', lastName: 'History', archivedAt: null };
		ctx.personnelCriticalTasksRoster.findForHistory = async () =>
			person as Awaited<ReturnType<typeof ctx.personnelCriticalTasksRoster.findForHistory>>;
		const client = createClient('https://synthetic.example.test', 'synthetic-key', {
			auth: { persistSession: false, autoRefreshToken: false },
			global: {
				fetch: async (input) => {
					const url = new URL(String(input));
					if (url.href.length > 8192) return Response.json({ message: 'URI too long' }, { status: 414 });
					expect(url.searchParams.get('organization_id')).toBe(`eq.${ctx.auth.orgId}`);
					if (url.pathname.endsWith('/personnel_ict_completions')) {
						expect(url.searchParams.get('personnel_id')).toBe('eq.person-history');
						return Response.json(completions);
					}
					expect(url.pathname).toBe('/rest/v1/ict_tasks');
					const requested = url.searchParams.get('id');
					return Response.json(tasks.filter((task) => requested?.includes(task.id)));
				}
			}
		});
		const history = await fetchCriticalTasksPersonnelHistory(
			{
				...ctx,
				criticalTaskCompletions: createSupabaseCriticalTaskCompletionPersistence(client, ctx.auth.orgId),
				criticalTaskLibrary: createSupabaseCriticalTaskLibraryPersistence(client, ctx.auth.orgId)
			},
			'person-history'
		);
		expect(history.rows.map((row) => [row.completion.id, row.taskCode, row.completion.notes])).toEqual(
			ids.map((_, i) => [`completion-${i}`, `HISTORY-${i}`, `date-${i}`])
		);
		expect(history.rows[500].taskArchivedAt).toBe('2026-03-16T12:00:00Z');
	});
});

describe('paged Personnel Critical Tasks history', () => {
	it('retains distinct same-date captures when the provider reorders ties between pages', async () => {
		const ctx = createTestContext({ auth: { orgId: '70000000-0000-4000-8000-000000000001' } });
		const personId = '40000000-0000-4000-8000-000000000001';
		const completionId = (index: number) => `50000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
		const taskId = (index: number) => `60000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
		ctx.store.seed('personnel', [
			{
				id: personId,
				organization_id: ctx.auth.orgId,
				first_name: 'Synthetic',
				last_name: 'History',
				archived_at: null
			}
		]);
		ctx.store.seed(
			'ict_tasks',
			Array.from({ length: 1003 }, (_, index) => ({
				id: taskId(index),
				organization_id: ctx.auth.orgId,
				task_code: `RETAINED-${index}`,
				title: `Retained task ${index}`,
				mos: [],
				archived_at: '2026-03-16T12:00:00Z'
			}))
		);
		const capture = (index: number, completedAt: string, notes: string) => ({
			id: completionId(index),
			organization_id: ctx.auth.orgId,
			personnel_id: personId,
			ict_task_id: taskId(index),
			completed_at: completedAt,
			created_at: `${completedAt}T12:00:00Z`,
			validation_method: 'Demonstration',
			validated_by: null,
			notes,
			logged_by: null
		});
		const captures: Record<string, string | null>[] = [
			...Array.from({ length: 1000 }, (_, index) => capture(index, '2026-03-15', 'Repeated practice')),
			capture(1000, '2026-03-15', 'First distinct capture'),
			capture(1001, '2026-03-15', 'Second distinct capture'),
			capture(1002, '2026-01-01', 'Older validation')
		];
		const client = createClient('https://provider.invalid', 'synthetic-key', {
			auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
			global: {
				fetch: async (input) => {
					const url = new URL(String(input));
					const offset = Number(url.searchParams.get('offset') ?? 0);
					// SQL may return equal sort keys in a different order for each request.
					const rows = offset === 0 ? [...captures] : [...captures].reverse();
					const order = (url.searchParams.get('order') ?? '').split(',').filter(Boolean);
					rows.sort((left, right) => {
						for (const term of order) {
							const [column, direction] = term.split('.');
							const comparison = String(left[column] ?? '').localeCompare(String(right[column] ?? ''));
							if (comparison) return direction === 'desc' ? -comparison : comparison;
						}
						return 0;
					});
					return Response.json(rows.slice(offset, offset + Number(url.searchParams.get('limit') ?? 1000)));
				}
			}
		});
		ctx.criticalTaskCompletions = createSupabaseCriticalTaskCompletionPersistence(client, ctx.auth.orgId);

		const result = await fetchCriticalTasksPersonnelHistory(ctx, personId);
		expect(new Set(result.rows.map(({ completion }) => completion.id)).size).toBe(1003);
		expect(
			result.rows
				.filter(({ completion }) => completion.notes !== 'Repeated practice')
				.map(({ completion, taskArchivedAt }) => [
					completion.id,
					completion.completedAt,
					completion.notes,
					taskArchivedAt
				])
		).toEqual([
			['50000000-0000-4000-8000-000000001000', '2026-03-15', 'First distinct capture', '2026-03-16T12:00:00Z'],
			['50000000-0000-4000-8000-000000001001', '2026-03-15', 'Second distinct capture', '2026-03-16T12:00:00Z'],
			['50000000-0000-4000-8000-000000001002', '2026-01-01', 'Older validation', '2026-03-16T12:00:00Z']
		]);
	});
});
