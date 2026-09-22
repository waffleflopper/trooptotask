// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/svelte';
import { createReadyAppShellRouteData } from '$lib/test-support/appShellRouteData';

import Page from './+page.svelte';

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

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
				issues: []
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
});
