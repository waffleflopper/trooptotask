import { createClient } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchDashboardSummary } from '$features/dashboard/index.server';
import type { DashboardBootstrap } from '$features/dashboard/contracts';
import { createTestContext } from './inMemory';
import { createRequestDashboardSummaryContext } from './requestContexts.server';

const { getAdminClient } = vi.hoisted(() => ({ getAdminClient: vi.fn() }));
vi.mock('$lib/server/supabase', () => ({ getAdminClient }));

function request(groupIds: string[] = ['group-alpha'], criticalTasks: 'view' | 'none' = 'view') {
	const ctx = createTestContext({
		auth: {
			role: 'member',
			isPrivileged: false,
			scopeSet: { kind: 'groups', groupIds },
			capabilityMap: {
				calendar: 'none',
				personnel: 'none',
				training: 'none',
				criticalTasks,
				onboarding: 'none',
				ratingScheme: 'none'
			}
		}
	});
	ctx.store.seed('organizations', [{ id: ctx.auth.orgId, critical_tasks_default_expiration_months: 12 }]);
	ctx.store.seed('groups', [{ id: 'group-alpha', organization_id: ctx.auth.orgId, name: 'Alpha' }]);
	ctx.store.seed('ict_tasks', [
		{
			id: 'task-common',
			organization_id: ctx.auth.orgId,
			task_code: '081-833-0010',
			title: 'Open airway',
			category: 'Medical',
			mos: [],
			expiration_months: 12,
			sort_order: 0,
			archived_at: null,
			created_at: '2026-01-01T00:00:00Z'
		}
	]);
	const completions = [
		{
			id: 'completion-alpha',
			organization_id: ctx.auth.orgId,
			personnel_id: 'person-alpha',
			ict_task_id: 'task-common',
			completed_at: '2026-01-15',
			validation_method: 'Demonstration',
			created_at: '2026-01-15T00:00:00Z'
		}
	];
	const providerFetch = vi.fn(async (input: RequestInfo | URL) => {
		const url = new URL(input instanceof Request ? input.url : input.toString());
		if (url.pathname !== '/rest/v1/personnel') throw new Error('Unexpected admin query');
		expect(url.searchParams.get('organization_id')).toBe(`eq.${ctx.auth.orgId}`);
		expect(url.searchParams.get('group_id')).toBe('in.(group-alpha)');
		expect(url.searchParams.get('archived_at')).toBe('is.null');
		return Response.json([
			{
				id: 'person-alpha',
				organization_id: ctx.auth.orgId,
				group_id: 'group-alpha',
				first_name: 'Ann',
				last_name: 'Alpha',
				rank: 'SGT',
				mos: '68W',
				archived_at: null,
				groups: { name: 'Alpha' }
			}
		]);
	});
	const options = { auth: { persistSession: false, autoRefreshToken: false } };
	getAdminClient.mockReturnValue(
		createClient('http://127.0.0.1:9', 'synthetic-admin', {
			...options,
			global: { fetch: providerFetch }
		})
	);
	const supabase = createClient('http://127.0.0.1:9', 'synthetic-request', {
		...options,
		global: {
			fetch: async (input) => {
				const url = new URL(input instanceof Request ? input.url : input.toString());
				if (url.pathname === '/rest/v1/groups') {
					expect(url.searchParams.get('organization_id')).toBe(`eq.${ctx.auth.orgId}`);
					expect(url.searchParams.has('group_id')).toBe(false);
					return Response.json(await ctx.rawStore.findMany('groups', ctx.auth.orgId));
				}
				if (url.pathname === '/rest/v1/personnel_ict_completions') {
					expect(url.searchParams.get('organization_id')).toBe(`eq.${ctx.auth.orgId}`);
					expect(url.searchParams.get('personnel_id')).toBe('in.(person-alpha)');
					expect(url.searchParams.get('ict_task_id')).toBe('in.(task-common)');
					return Response.json(completions);
				}
				if (url.pathname !== '/rest/v1/ict_tasks') throw new Error('Ordinary Personnel read is forbidden');
				expect(url.searchParams.get('organization_id')).toBe(`eq.${ctx.auth.orgId}`);
				expect(url.searchParams.get('archived_at')).toBe('is.null');
				return Response.json(await ctx.rawStore.findMany('ict_tasks', ctx.auth.orgId));
			}
		}
	});
	return { ...ctx, supabase, session: null };
}

const workspace = { personnel: [], trainingTypes: [], activeOnboardings: [] } as unknown as DashboardBootstrap;

describe('Dashboard request composition', () => {
	beforeEach(() => {
		getAdminClient.mockReset();
		vi.useFakeTimers({ toFake: ['Date'] });
		vi.setSystemTime(new Date('2026-03-20T12:00:00Z'));
	});
	afterEach(() => vi.useRealTimers());

	it('loads readiness through the real selected context for a scoped Critical Tasks-only viewer', async () => {
		const ctx = createRequestDashboardSummaryContext(request());
		await expect(
			fetchDashboardSummary(ctx, workspace, { training: false, criticalTasks: true })
		).resolves.toMatchObject({
			trainingSummary: null,
			ictlSummary: { readyCount: 1, applicableCount: 1, overallReadinessPercent: 100 },
			onboardingTrainingCompletions: []
		});
	});

	it('settles an empty Group scope without acquiring the privileged roster client', async () => {
		const ctx = createRequestDashboardSummaryContext(request([]));
		await expect(
			fetchDashboardSummary(ctx, workspace, { training: false, criticalTasks: true })
		).resolves.toMatchObject({
			ictlSummary: { readyCount: 0, applicableCount: 0 }
		});
		expect(getAdminClient).not.toHaveBeenCalled();
	});

	it('denies a forged readiness request before acquiring the privileged roster client', async () => {
		const ctx = createRequestDashboardSummaryContext(request(['group-alpha'], 'none'));
		await expect(fetchDashboardSummary(ctx, workspace, { training: false, criticalTasks: true })).rejects.toMatchObject(
			{ status: 403 }
		);
		expect(getAdminClient).not.toHaveBeenCalled();
	});
});
