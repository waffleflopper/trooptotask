import { createClient } from '@supabase/supabase-js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DashboardPageSummaryData, DashboardWorkspaceResult } from '$features/dashboard/contracts';
import { parseOrganizationSetup, type OrganizationSetup } from '$features/organization/contracts';
import { buildLayoutRequest } from '$lib/server/adapters/requestContexts.server';
import { handleUseCaseRequest } from '$lib/server/adapters/httpAdapter';
import { streamOrganizationSetupEntry, streamSetupInvitationProgress } from './setupEntryLoad.server';
import { createOrganizationLoadEventData, createReadyAppShellRouteData } from './appShell.test-support';
import { _getConfig as progress } from './api/organization/setup/progress/+server';

const { adminClient } = vi.hoisted(() => ({ adminClient: vi.fn() }));
vi.mock('$lib/server/supabase', () => ({ getAdminClient: adminClient }));

const ORG = '11111111-1111-4111-8111-111111111111';
const empty = parseOrganizationSetup(null);

function fixture(role: 'owner' | 'admin' | 'member' = 'owner', state: OrganizationSetup = empty) {
	const requests: { path: string; method: string }[] = [];
	const failures = new Set<string>();
	const supabase = createClient('http://organization.invalid', 'synthetic-request-key', {
		auth: { persistSession: false, autoRefreshToken: false },
		global: {
			fetch: async (input, init) => {
				const url = new URL(String(input));
				const path = url.pathname.replace('/rest/v1/', '');
				const method = init?.method ?? 'GET';
				requests.push({ path, method });
				if (failures.has(path)) return Response.json({ message: 'Unavailable' }, { status: 400 });
				if (path === 'organizations')
					return Response.json({
						id: ORG,
						name: 'Alpha',
						url_slug: 'alpha',
						suspended_at: null,
						disabled_features: [],
						created_at: '2020-01-01T12:00:00Z',
						loss_warning_window_days: 90
					});
				if (path === 'rpc/read_organization_setup') return Response.json(state);
				if (method === 'HEAD')
					return new Response(null, {
						headers: {
							'Content-Range': `*/${path === 'rating_scheme_entries' || path === 'organization_memberships' ? 1 : 0}`
						}
					});
				return Response.json([]);
			}
		}
	});
	const event = createOrganizationLoadEventData(
		createReadyAppShellRouteData({ orgId: ORG, orgUrlSegment: 'alpha', role })
	);
	event.locals.supabase = supabase;
	adminClient.mockReturnValue(supabase);
	return { ...event, orgId: ORG, cookies: { get: () => 'America/Anchorage' }, requests, failures };
}

const workspace = Promise.resolve({
	data: {
		personnel: [{ id: 'person-1' }],
		groups: [],
		statusTypes: [],
		assignmentTypes: [],
		trainingTypes: [{ id: 'type-1' }],
		hasAnyOnboardingTemplate: true,
		lossWarningWindowDays: 90
	}
} as unknown as DashboardWorkspaceResult);
const summary = Promise.resolve({ ictlSummary: { hasActiveTasks: true } } as DashboardPageSummaryData);

afterEach(() => vi.useRealTimers());

describe('setup entry delivery', () => {
	it('streams the owner decision once per request and uses the viewer day', async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-10-28T02:00:00Z'));
		const event = fixture('owner', { ...empty, prompts: { setup: { snoozedUntil: '2026-10-28' } } });
		const [entry, duplicate] = await Promise.all([
			streamOrganizationSetupEntry(event),
			streamOrganizationSetupEntry(event)
		]);
		expect(entry).toEqual({
			orgId: ORG,
			state: { branch: null, answers: {}, finishedAt: null, prompts: { setup: { snoozedUntil: '2026-10-28' } } },
			today: '2026-10-27',
			entry: { prompt: null, resume: { kind: 'setup' } }
		});
		expect(duplicate).toEqual(entry);
		expect(event.requests.filter((request) => request.path === 'rpc/read_organization_setup')).toEqual([
			{ path: 'rpc/read_organization_setup', method: 'POST' }
		]);
	});

	it.each(['admin', 'member'] as const)('returns no data and reads no setup state for %s', async (role) => {
		const event = fixture(role);
		expect(await streamOrganizationSetupEntry(event)).toBeNull();
		expect(event.requests).toEqual([{ path: 'organizations', method: 'GET' }]);
	});

	it('starts fresh for the next request instead of retaining a dismissed invitation', async () => {
		const first = fixture();
		const second = fixture('owner', { ...empty, prompts: { setup: { never: true } } });
		expect((await streamOrganizationSetupEntry(first))?.entry).toEqual({
			prompt: { kind: 'invitation' },
			resume: null
		});
		expect((await streamOrganizationSetupEntry(second))?.entry).toEqual({ prompt: null, resume: null });
	});
});

describe('Dashboard invitation progress', () => {
	it('combines existing Dashboard facts and the missing whole-unit counts', async () => {
		const event = fixture('owner', {
			...empty,
			branch: 'army',
			answers: { groups: 'reviewed', ranks: 'reviewed', calendar: 'reviewed' }
		});
		const request = await buildLayoutRequest(event.locals, ORG);
		const result = streamSetupInvitationProgress({
			request,
			entry: streamOrganizationSetupEntry(event),
			workspace,
			summary
		});
		await expect(result).resolves.toMatchObject({ orgId: ORG, done: 9, total: 12, loadErrors: [] });
		expect((await result)?.completedSteps.map((step) => step.key)).toEqual([
			'welcome',
			'groups',
			'ranks',
			'personnel',
			'calendar',
			'training',
			'criticalTasks',
			'evaluations',
			'onboarding'
		]);
		expect(
			event.requests
				.filter((request) => request.method === 'HEAD')
				.map((request) => request.path)
				.sort()
		).toEqual([
			'calendar_events',
			'calendar_taskings',
			'organization_invitations',
			'organization_memberships',
			'rating_scheme_entries'
		]);
	});

	it.each(['admin', 'member'] as const)('gives %s no invitation progress or extra reads', async (role) => {
		const event = fixture(role);
		const request = await buildLayoutRequest(event.locals, ORG);
		const result = streamSetupInvitationProgress({
			request,
			entry: streamOrganizationSetupEntry(event),
			workspace,
			summary
		});
		await expect(result).resolves.toBeNull();
		expect(event.requests).toEqual([{ path: 'organizations', method: 'GET' }]);
	});

	it.each([
		{ ...empty, finishedAt: '2026-10-27T00:00:00Z' },
		{ ...empty, prompts: { setup: { never: true as const } } },
		{ ...empty, prompts: { setup: { snoozedUntil: '2027-01-01' } } }
	])('does not load facts when no invitation is possible', async (state) => {
		const event = fixture('owner', state);
		const request = await buildLayoutRequest(event.locals, ORG);
		await expect(
			streamSetupInvitationProgress({ request, entry: streamOrganizationSetupEntry(event), workspace, summary })
		).resolves.toBeNull();
		expect(event.requests).toEqual([
			{ path: 'organizations', method: 'GET' },
			{ path: 'rpc/read_organization_setup', method: 'POST' }
		]);
	});

	it('reports a missing fact without failing the other completed steps', async () => {
		const event = fixture('owner');
		event.failures.add('rating_scheme_entries');
		const request = await buildLayoutRequest(event.locals, ORG);
		const log = vi.spyOn(console, 'error').mockImplementation(() => {});
		try {
			const result = await streamSetupInvitationProgress({
				request,
				entry: streamOrganizationSetupEntry(event),
				workspace,
				summary
			});
			expect(result).toMatchObject({ done: 4, total: 12, loadErrors: [{ source: 'evaluations' }] });
		} finally {
			log.mockRestore();
		}
	});
});

describe('on-demand Resume progress', () => {
	it.each(['owner', 'admin', 'member'] as const)('returns progress only to %s when allowed', async (role) => {
		const event = fixture(role, { ...empty, answers: { groups: 'reviewed' } });
		const request = await buildLayoutRequest(event.locals, ORG);
		if (role === 'owner') {
			const result = await handleUseCaseRequest(progress, request, undefined, () => request);
			expect(result).toMatchObject({ total: 12, reviewed: 2, firstUnansweredSlug: 'welcome' });
			expect(result.steps.find((step) => step.key === 'groups')?.state).toBe('done');
		} else {
			await expect(handleUseCaseRequest(progress, request, undefined, () => request)).rejects.toMatchObject({
				status: 403
			});
			expect(event.requests).toEqual([{ path: 'organizations', method: 'GET' }]);
		}
	});
});
