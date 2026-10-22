// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { createReadyAppShellRouteData } from '../appShell.test-support';
import { createClientAccess } from '$lib/access/clientAccess';

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
					trainingTypes: []
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
			onboardingTrainingCompletions: []
		}
	};

	return {
		...base,
		...overrides
	};
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

	it('still builds the Dashboard after a rejected summary instead of replacing it with the failure', async () => {
		let reject!: (reason: Error) => void;
		const pending = new Promise((_, rejectPromise) => {
			reject = rejectPromise;
		});
		render(Page, { props: { data: makePageData({ summary: pending }) } });
		expect(autoShowWhatsNew).not.toHaveBeenCalled();

		reject(new Error('Source unavailable'));

		await waitFor(() => expect(autoShowWhatsNew).toHaveBeenCalled());
		expect(screen.queryByRole('alert')).toBeNull();
		expect(screen.getByRole('region', { name: 'Readiness' })).toBeTruthy();
	});
});
