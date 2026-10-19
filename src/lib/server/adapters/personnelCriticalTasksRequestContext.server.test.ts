import { createClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { loadPersonnelCriticalTaskReadiness } from '$features/critical-tasks/index.server';
import type { Personnel } from '$features/personnel/contracts';
import { authorizePersonnelLane } from '$features/personnel/index.server';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { createTestContext } from './inMemory';
import { createRequestPersonnelReadinessContext } from './requestContexts.server';

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
		if (url.pathname === '/rest/v1/organizations') {
			expect(url.searchParams.get('id')).toBe(`eq.${ctx.auth.orgId}`);
			return Response.json({
				critical_tasks_default_expiration_months: 12,
				critical_tasks_expiring_soon_warning_days: 60
			});
		}
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

const personAlpha = {
	id: 'person-alpha',
	slug: 'alpha-ann',
	rank: 'SPC',
	firstName: 'Ann',
	lastName: 'Alpha',
	mos: '68W',
	clinicRole: 'Medic',
	groupId: null,
	groupName: '',
	ets: null,
	deros: null,
	archivedAt: null
} satisfies Personnel;

function loadReadiness(input: ReturnType<typeof request>) {
	const contexts = createRequestPersonnelReadinessContext(input);
	return loadPersonnelCriticalTaskReadiness({
		organizationSettings: contexts.organizationSettings,
		criticalTaskLibrary: contexts.criticalTaskLibrary,
		criticalTaskCompletions: contexts.criticalTaskCompletions,
		orgId: contexts.detail.auth.orgId,
		asOf: '2026-03-20',
		loadAuthorizedPerson: () =>
			authorizePersonnelLane(
				contexts.detail,
				personAlpha,
				POLICY_ACTION_CATALOG.criticalTasks.viewReadiness,
				'personnel_ict_completion'
			)
	});
}

describe('Personnel Critical Tasks request composition', () => {
	it('combines the ordinary owned library with dated completions after actual lane admission', async () => {
		const readiness = await loadReadiness(request('view'));
		expect(readiness.items.map((item) => [item.taskId, item.status, item.expirationDate])).toEqual([
			['task-medic', 'current', '2027-01-15']
		]);
	});

	it('denies the lane before querying the task library for a Personnel-only member', async () => {
		const input = request('none');
		await expect(loadReadiness(input)).rejects.toMatchObject({ status: 403 });
		expect(input.providerFetch.mock.calls.map(([url]) => new URL(String(url)).pathname)).toEqual([]);
	});
});
