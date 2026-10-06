import { createClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { loadCriticalTasksReadinessLane } from '$features/critical-tasks/index.server';
import { loadPersonnelForLane } from '$features/personnel/index.server';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { createTestContext } from './inMemory';
import { createRequestPersonnelDetailStreamsContext } from './requestContexts.server';

function request(criticalTasks: 'view' | 'none') {
	const ctx = createTestContext({
		auth: {
			role: 'member',
			isPrivileged: false,
			capabilityMap: {
				calendar: 'none',
				personnel: 'configure',
				training: 'none',
				criticalTasks,
				onboarding: 'none',
				ratingScheme: 'none'
			}
		}
	});
	ctx.store.seed('personnel', [
		{
			id: 'person-alpha',
			organization_id: ctx.auth.orgId,
			group_id: null,
			first_name: 'Ann',
			last_name: 'Alpha',
			mos: '68W',
			archived_at: null
		}
	]);
	ctx.store.seed('organizations', [{ id: ctx.auth.orgId, critical_tasks_default_expiration_months: 12 }]);
	const completions = [
		{
			id: 'completion-alpha',
			organization_id: ctx.auth.orgId,
			personnel_id: 'person-alpha',
			ict_task_id: 'task-medic',
			completed_at: '2026-01-15',
			validation_method: 'Demonstration',
			created_at: '2026-01-15T00:00:00Z'
		}
	];
	const providerFetch = vi.fn(async (input: RequestInfo | URL) => {
		const url = new URL(input instanceof Request ? input.url : input.toString());
		if (url.pathname === '/rest/v1/personnel_ict_completions') {
			expect(url.searchParams.get('organization_id')).toBe(`eq.${ctx.auth.orgId}`);
			expect(url.searchParams.get('personnel_id')).toBe('eq.person-alpha');
			return Response.json(completions);
		}
		if (url.pathname !== '/rest/v1/ict_tasks') throw new Error('Unexpected ordinary provider read');
		expect(url.searchParams.get('organization_id')).toBe(`eq.${ctx.auth.orgId}`);
		expect(url.searchParams.get('archived_at')).toBe('is.null');
		return Response.json([
			{
				id: 'task-medic',
				organization_id: ctx.auth.orgId,
				task_code: 'MED-1',
				title: 'Open airway',
				description: null,
				category: 'Medical',
				mos: ['68W'],
				expiration_months: 12,
				sort_order: 1,
				archived_at: null,
				created_at: '2026-01-01T00:00:00Z'
			}
		]);
	});
	const supabase = createClient('http://127.0.0.1:9', 'synthetic-request', {
		auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
		global: { fetch: providerFetch }
	});
	return { ...ctx, supabase, session: null, providerFetch };
}

function loadReadiness(input: ReturnType<typeof request>) {
	const contexts = createRequestPersonnelDetailStreamsContext(input);
	return loadCriticalTasksReadinessLane({
		store: contexts.detail.store,
		criticalTaskLibrary: contexts.criticalTaskLibrary,
		criticalTaskCompletions: contexts.criticalTaskCompletions,
		orgId: contexts.detail.auth.orgId,
		personnelId: 'person-alpha',
		asOf: '2026-03-20',
		loadAuthorizedPerson: () =>
			loadPersonnelForLane(
				contexts.detail,
				'person-alpha',
				POLICY_ACTION_CATALOG.criticalTasks.viewReadiness,
				'personnel_ict_completion'
			)
	});
}

describe('Personnel Critical Tasks request composition', () => {
	it('combines the ordinary owned library with dated completions after actual lane admission', async () => {
		await expect(loadReadiness(request('view'))).resolves.toMatchObject({
			value: '100%',
			detail: '1 of 1 applicable ICT tasks ready. No tasks need attention.',
			tone: 'good'
		});
	});

	it('denies the lane before querying the task library for a Personnel-only member', async () => {
		const input = request('none');
		await expect(loadReadiness(input)).rejects.toMatchObject({ status: 403 });
		expect(input.providerFetch).not.toHaveBeenCalled();
	});
});
