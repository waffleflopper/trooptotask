// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/svelte';
import PassiveStub from '$features/duty-roster/components/test-stubs/PassiveStub.svelte';

vi.mock('$features/dashboard', async () => {
	const actual = await vi.importActual<typeof import('$features/dashboard')>('$features/dashboard');
	return {
		...actual,
		DashboardPageView: PassiveStub
	};
});

import Page from './+page.svelte';

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

function makePageData(overrides: Record<string, unknown> = {}) {
	const base = {
		orgId: 'org-1',
		orgName: 'Test Unit',
		userId: 'user-1',
		userRole: 'owner',
		permissions: {
			canViewCalendar: true,
			canEditCalendar: true,
			canViewPersonnel: true,
			canEditPersonnel: true,
			canViewTraining: true,
			canEditTraining: true,
			canViewOnboarding: true,
			canEditOnboarding: true,
			canManageMembers: true
		},
		dashboard: {
			workspace: 'dashboard',
			data: {
				availabilityEntries: [],
				assignmentTypes: [],
				todayAssignments: [],
				pinnedGroups: [],
				ratingSchemeEntries: [],
				activeOnboardings: [],
				todayDutyEvents: [],
				personnel: [],
				groups: [],
				statusTypes: [],
				trainingTypes: []
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
	it('does not load workspace support for non-privileged members', async () => {
		const fetchMock = vi.fn();
		vi.stubGlobal('fetch', fetchMock);

		render(Page, {
			props: {
				data: makePageData({
					userRole: 'member'
				})
			}
		});

		await Promise.resolve();

		expect(fetchMock).not.toHaveBeenCalled();
		expect(screen.queryByText('Loading workspace support...')).toBeNull();
		expect(screen.queryByText('Workspace support is temporarily unavailable.')).toBeNull();
	});

	it('reloads workspace support when navigating to another org route after support data has loaded', async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce({
				ok: true,
				json: async () => ({
					onboardingTemplateStepCount: 1,
					ratingSchemeEntryCount: 2,
					orgMemberCount: 3,
					gettingStartedDismissed: false
				})
			})
			.mockResolvedValueOnce({
				ok: true,
				json: async () => ({
					onboardingTemplateStepCount: 4,
					ratingSchemeEntryCount: 5,
					orgMemberCount: 6,
					gettingStartedDismissed: true
				})
			});
		vi.stubGlobal('fetch', fetchMock);

		const view = render(Page, {
			props: {
				data: makePageData()
			}
		});

		await waitFor(() => {
			expect(fetchMock).toHaveBeenNthCalledWith(1, '/org/org-1/api/getting-started');
		});

		await view.rerender({
			data: makePageData({
				orgId: 'org-2',
				orgName: 'Second Unit'
			})
		});

		await waitFor(() => {
			expect(fetchMock).toHaveBeenNthCalledWith(2, '/org/org-2/api/getting-started');
		});
	});

	it('reloads workspace support when navigating to another org route after a support failure', async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce({
				ok: false,
				json: async () => ({ message: 'support unavailable' })
			})
			.mockResolvedValueOnce({
				ok: true,
				json: async () => ({
					onboardingTemplateStepCount: 1,
					ratingSchemeEntryCount: 1,
					orgMemberCount: 1,
					gettingStartedDismissed: false
				})
			});
		vi.stubGlobal('fetch', fetchMock);

		const view = render(Page, {
			props: {
				data: makePageData()
			}
		});

		expect(await screen.findByText('Workspace support is temporarily unavailable.')).toBeTruthy();

		await view.rerender({
			data: makePageData({
				orgId: 'org-2',
				orgName: 'Second Unit'
			})
		});

		await waitFor(() => {
			expect(fetchMock).toHaveBeenNthCalledWith(2, '/org/org-2/api/getting-started');
		});
	});

	it('loads workspace support lazily after render and shows a retry notice on failure', async () => {
		const fetchMock = vi.fn().mockResolvedValue({
			ok: false,
			json: async () => ({ message: 'support unavailable' })
		});
		vi.stubGlobal('fetch', fetchMock);

		render(Page, {
			props: {
				data: makePageData()
			}
		});

		await waitFor(() => {
			expect(fetchMock).toHaveBeenCalledWith('/org/org-1/api/getting-started');
		});

		expect(await screen.findByText('Workspace support is temporarily unavailable.')).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Retry checklist' })).toBeTruthy();
	});
});
