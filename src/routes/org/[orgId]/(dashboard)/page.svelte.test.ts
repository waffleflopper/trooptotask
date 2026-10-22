// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { tick } from 'svelte';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { createReadyAppShellRouteData } from '../appShell.test-support';
import { createClientAccess } from '$lib/access/clientAccess';
import { dashboardWorkspaceHydrator } from '$features/dashboard';

import Page from './+page.svelte';

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
	autoShowWhatsNew.mockClear();
});

const autoShowWhatsNew = vi.hoisted(() => vi.fn());

vi.mock('$features/app-shell', () => ({
	getAppShellContext: () => ({ ...createClientAccess({ membershipRole: 'owner' }), autoShowWhatsNew })
}));

function makePageData(overrides: Record<string, unknown> = {}) {
	const orgId = typeof overrides.orgId === 'string' ? overrides.orgId : 'org-1';
	const orgName = typeof overrides.orgName === 'string' ? overrides.orgName : 'Test Unit';
	const userRole = typeof overrides.userRole === 'string' ? overrides.userRole : 'owner';
	const base = {
		...createReadyAppShellRouteData({
			orgId,
			orgName,
			userId: 'user-1',
			role: userRole === 'member' ? 'member' : 'owner'
		}),
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
		summary: {
			trainingSummary: {
				stats: {
					total: 0,
					current: 0,
					expired: 0,
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
		}
	};

	return {
		...base,
		...overrides
	};
}

async function hydrateEmptyWorkspace(orgId: string) {
	const range = { rangeStart: '2026-10-19', rangeEnd: '2026-11-01' };
	const empty = (key: string) => ({ mode: 'replace' as const, snapshotKey: `${key}:${orgId}`, items: [] });
	await dashboardWorkspaceHydrator.hydrate({
		orgId,
		confirmedChangesByTab: {},
		personnel: empty('personnel'),
		groups: empty('groups'),
		statusTypes: empty('status-types'),
		availabilityEntries: { mode: 'range', snapshotKey: `availability:${orgId}`, items: [], range },
		calendarAssignments: {
			mode: 'range',
			snapshotKey: `assignments:${orgId}`,
			items: { types: [], assignments: [] },
			range
		},
		trainingTypes: empty('training-types'),
		pinnedGroups: empty('pinned')
	});
}

describe('dashboard page', () => {
	it('does not request disabled setup support for an owner, including after Organization navigation', async () => {
		const fetchMock = vi.fn().mockRejectedValue(new Error('Disabled setup must not be requested'));
		vi.stubGlobal('fetch', fetchMock);
		const view = render(Page, { props: { data: makePageData() } });
		await waitFor(() => expect(document.title).toContain('Test Unit'));
		expect(fetchMock).not.toHaveBeenCalled();

		await view.rerender({ data: makePageData({ orgId: 'org-2', orgName: 'Second Unit' }) });
		await waitFor(() => expect(document.title).toContain('Second Unit'));
		expect(fetchMock).not.toHaveBeenCalled();
		expect(screen.queryByRole('progressbar', { name: 'Workspace setup progress' })).toBeNull();
		expect(screen.queryByRole('button', { name: 'Retry checklist' })).toBeNull();
	});
	it('shows a retry after a rejected workspace and clears the error on Organization navigation', async () => {
		const reload = vi.spyOn(window.location, 'reload').mockImplementation(() => {});
		let reject!: (reason: Error) => void;
		const pending = new Promise((_, rejectPromise) => {
			reject = rejectPromise;
		});
		const view = render(Page, { props: { data: makePageData({ dashboard: { data: pending } }) } });
		reject(new Error('Source unavailable'));
		await screen.findByRole('alert');
		expect(screen.queryByRole('status')).toBeNull();
		await fireEvent.click(screen.getByRole('button', { name: 'Retry Dashboard' }));
		expect(reload).toHaveBeenCalledOnce();

		await view.rerender({ data: makePageData({ orgId: 'org-2', orgName: 'Second Unit' }) });
		await waitFor(() => expect(document.title).toContain('Second Unit'));
		expect(screen.queryByRole('alert')).toBeNull();
	});

	it('still builds the Dashboard after a rejected summary and offers one Retry', async () => {
		await hydrateEmptyWorkspace('org-1');
		const reload = vi.spyOn(window.location, 'reload').mockImplementation(() => {});
		let reject!: (reason: Error) => void;
		const pending = new Promise((_, rejectPromise) => {
			reject = rejectPromise;
		});
		render(Page, { props: { data: makePageData({ summary: pending }) } });
		expect(autoShowWhatsNew).not.toHaveBeenCalled();

		reject(new Error('Source unavailable'));

		await waitFor(() => expect(autoShowWhatsNew).toHaveBeenCalled());
		expect(screen.getByRole('region', { name: 'Readiness' })).toBeTruthy();
		expect(screen.getByText(/Needs you is incomplete/)).toBeTruthy();
		await fireEvent.click(screen.getByRole('button', { name: 'Retry Dashboard' }));
		expect(reload).toHaveBeenCalledOnce();
	});

	it('keeps the last summary through a background refresh, including one that fails, but not across Organizations', async () => {
		await hydrateEmptyWorkspace('org-1');
		const view = render(Page, { props: { data: makePageData() } });
		await waitFor(() => expect(screen.queryByRole('status')).toBeNull());

		let reject!: (reason: Error) => void;
		const refresh = new Promise((_, rejectPromise) => {
			reject = rejectPromise;
		});
		await view.rerender({ data: makePageData({ summary: refresh }) });
		expect(screen.queryByRole('status')).toBeNull();
		expect(screen.getByRole('region', { name: 'Readiness' }).getAttribute('aria-busy')).toBe('false');
		expect(screen.getByRole('heading', { level: 3, name: 'Training' })).toBeTruthy();
		reject(new Error('Summary unavailable'));
		await refresh.catch(() => {});
		await tick();
		expect(screen.queryByRole('alert')).toBeNull();
		expect(screen.queryByRole('status')).toBeNull();

		await view.rerender({
			data: makePageData({ orgId: 'org-2', orgName: 'Second Unit', summary: new Promise(() => {}) })
		});
		expect(screen.getByRole('status').textContent).toBe('Loading Dashboard');
	});
});
