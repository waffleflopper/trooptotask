// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { tick } from 'svelte';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { createClientAccess } from '$lib/access/clientAccess';
import { createReadyAppShellRouteData } from '../appShell.test-support';
import type { DashboardPageSummaryData } from '$features/dashboard/contracts';
import Page from './+page.svelte';

vi.mock('$features/app-shell', () => ({
	getAppShellContext: () => ({ ...createClientAccess({ membershipRole: 'owner' }), autoShowWhatsNew: vi.fn() })
}));
vi.mock('$features/dashboard', async () => ({
	...(await vi.importActual<typeof import('$features/dashboard')>('$features/dashboard')),
	DashboardPageView: (await import('./DashboardUpdatesTestView.svelte')).default
}));
afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

function summary(current: number): DashboardPageSummaryData {
	return {
		trainingSummary: {
			stats: {
				total: 3,
				current,
				expired: 3 - current,
				warningOrange: 0,
				warningYellow: 0,
				notCompleted: 0,
				notRequired: 0
			},
			issues: [],
			expiredByType: [],
			expiredPersonnelCount: 0,
			groupDelinquencies: []
		},
		ictlSummary: null,
		onboardingTrainingCompletions: [],
		onboardingPersonnelIds: []
	};
}
function data(orgId: string, value: DashboardPageSummaryData | Promise<DashboardPageSummaryData> = summary(1)) {
	return {
		...createReadyAppShellRouteData({ orgId, role: 'owner' }),
		dashboard: {
			data: {
				workspaceKey: 'dashboard',
				data: {
					availabilityEntries: [],
					assignmentTypes: [],
					todayAssignments: [],
					pinnedGroups: [],
					ratingSchemeEntries: [],
					activeOnboardings: [],
					personnel: [],
					groups: [],
					statusTypes: [],
					trainingTypes: [],
					specialDays: [],
					strengthFloorPercent: 80
				},
				hydration: { orgId }
			}
		},
		viewerDay: { date: '2026-10-19', timeZone: 'UTC' },
		summary: value
	};
}
function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((done) => {
		resolve = done;
	});
	return { promise, resolve };
}
const value = () => screen.getByLabelText('Current people').textContent;
const refresh = () => fireEvent.click(screen.getByRole('button', { name: 'Refresh summary' }));

describe('Dashboard summary endpoint refresh', () => {
	it('makes no request on load and keeps the last values while pending, after failure and after an older response', async () => {
		const older = deferred<Response>();
		const newer = deferred<Response>();
		const fetchMock = vi
			.fn()
			.mockReturnValueOnce(older.promise)
			.mockReturnValueOnce(newer.promise)
			.mockRejectedValueOnce(new Error('offline'))
			.mockResolvedValueOnce(new Response(null, { status: 503 }));
		vi.stubGlobal('fetch', fetchMock);
		render(Page, { props: { data: data('org-1') } });
		await waitFor(() => expect(value()).toBe('1'));
		expect(fetchMock).not.toHaveBeenCalled();
		await refresh();
		expect(fetchMock.mock.calls[0][0]).toBe('/org/org-1/api/dashboard/summary');
		expect(value()).toBe('1');
		await refresh();
		newer.resolve(Response.json(summary(3)));
		await waitFor(() => expect(value()).toBe('3'));
		older.resolve(Response.json(summary(2)));
		await tick();
		await tick();
		expect(value()).toBe('3');
		await refresh();
		await tick();
		expect(value()).toBe('3');
		await refresh();
		await tick();
		expect(value()).toBe('3');
	});

	it('ignores a refresh after Organization navigation, including a return to the original Organization', async () => {
		const pending = deferred<Response>();
		vi.stubGlobal('fetch', vi.fn().mockReturnValueOnce(pending.promise));
		const view = render(Page, { props: { data: data('org-1') } });
		await waitFor(() => expect(value()).toBe('1'));
		await refresh();
		await view.rerender({ data: data('org-2', summary(2)) });
		await waitFor(() => expect(value()).toBe('2'));
		pending.resolve(Response.json(summary(3)));
		await tick();
		await tick();
		expect(value()).toBe('2');
		await view.rerender({ data: data('org-1', summary(1)) });
		await waitFor(() => expect(value()).toBe('1'));
	});

	it('does not let a delayed response body replace a newer Organization visit', async () => {
		const body = deferred<DashboardPageSummaryData>();
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: () => body.promise }));
		const view = render(Page, { props: { data: data('org-1') } });
		await waitFor(() => expect(value()).toBe('1'));
		await refresh();
		await view.rerender({ data: data('org-2', summary(2)) });
		await view.rerender({ data: data('org-1', summary(1)) });
		body.resolve(summary(3));
		await tick();
		await tick();
		expect(value()).toBe('1');
	});
});
