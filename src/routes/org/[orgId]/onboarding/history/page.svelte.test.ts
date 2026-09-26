// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/svelte';
import Page from './+page.svelte';
import { onboardingStore } from '$features/onboarding/stores/onboarding.svelte';
import { createReadyAppShellRouteData } from '$lib/test-support/appShellRouteData';
import { personnelRosterHydration } from '$features/personnel';

vi.mock('$lib/stores/orgContext.svelte', () => ({
	getOrgContext: () => ({
		orgId: 'org-1',
		orgUrlSegment: 'org-1',
		scopeSet: { kind: 'organization' }
	})
}));

afterEach(() => {
	cleanup();
	onboardingStore.load([], 'org-1');
	personnelRosterHydration.load([], 'org-test-reset');
});

describe('onboarding history page', () => {
	it('does not render redundant archived summary cards', () => {
		onboardingStore.load([], 'org-1');

		render(Page, {
			props: {
				data: createReadyAppShellRouteData({ orgId: 'org-1' })
			}
		});

		expect(screen.queryByText('Completed or cancelled onboarding records')).toBeNull();
		expect(screen.queryByText('Packets closed successfully')).toBeNull();
		expect(screen.queryByText('Packets stopped before completion')).toBeNull();
	});

	it('keeps archived personnel visible in completed history records', () => {
		personnelRosterHydration.load(
			[
				{
					id: 'p-archived',
					rank: 'SGT',
					firstName: 'Avery',
					lastName: 'Archived',
					mos: '68W',
					clinicRole: 'Medic',
					groupId: 'group-alpha',
					groupName: 'Alpha',
					archivedAt: '2026-03-01T00:00:00Z'
				}
			],
			'org-1'
		);
		onboardingStore.load(
			[
				{
					id: 'onboarding-1',
					personnelId: 'p-archived',
					startedAt: '2026-01-01T00:00:00Z',
					completedAt: '2026-02-01T00:00:00Z',
					cancelledAt: null,
					status: 'completed',
					steps: [],
					templateId: null
				}
			],
			'org-1'
		);

		render(Page, {
			props: {
				data: createReadyAppShellRouteData({ orgId: 'org-1' })
			}
		});

		expect(screen.getByText('SGT Archived, Avery')).toBeTruthy();
		expect(screen.queryByText('Unknown')).toBeNull();
	});

	it('renders completed and cancelled history records while excluding active onboardings', () => {
		personnelRosterHydration.load(
			[
				{
					id: 'p-completed',
					rank: 'SGT',
					firstName: 'Casey',
					lastName: 'Complete',
					mos: '11B',
					clinicRole: 'Team Leader',
					groupId: 'group-alpha',
					groupName: 'Alpha'
				},
				{
					id: 'p-cancelled',
					rank: 'CPL',
					firstName: 'Drew',
					lastName: 'Cancelled',
					mos: '68W',
					clinicRole: 'Medic',
					groupId: 'group-alpha',
					groupName: 'Alpha'
				},
				{
					id: 'p-active',
					rank: 'PFC',
					firstName: 'Riley',
					lastName: 'Active',
					mos: '25U',
					clinicRole: 'Signal',
					groupId: 'group-alpha',
					groupName: 'Alpha'
				}
			],
			'org-1'
		);
		onboardingStore.load(
			[
				{
					id: 'completed-onboarding',
					personnelId: 'p-completed',
					startedAt: '2026-01-01T00:00:00Z',
					completedAt: '2026-02-01T00:00:00Z',
					cancelledAt: null,
					status: 'completed',
					steps: [],
					templateId: null
				},
				{
					id: 'cancelled-onboarding',
					personnelId: 'p-cancelled',
					startedAt: '2026-01-03T00:00:00Z',
					completedAt: null,
					cancelledAt: '2026-02-03T00:00:00Z',
					status: 'cancelled',
					steps: [],
					templateId: null
				},
				{
					id: 'active-onboarding',
					personnelId: 'p-active',
					startedAt: '2026-01-05T00:00:00Z',
					completedAt: null,
					cancelledAt: null,
					status: 'in_progress',
					steps: [],
					templateId: null
				}
			],
			'org-1'
		);

		render(Page, {
			props: {
				data: createReadyAppShellRouteData({ orgId: 'org-1' })
			}
		});

		expect(screen.getByText('SGT Complete, Casey')).toBeTruthy();
		expect(screen.getByText('CPL Cancelled, Drew')).toBeTruthy();
		expect(screen.queryByText('PFC Active, Riley')).toBeNull();
	});
});
