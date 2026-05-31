// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/svelte';
import Page from './+page.svelte';
import { onboardingStore } from '$features/onboarding/stores/onboarding.svelte';
import { createReadyAppShellRouteData } from '$lib/test-support/appShellRouteData';
import { rosterStore } from '$lib/stores/roster.svelte';

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
	rosterStore.load([], 'org-test-reset');
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
		rosterStore.load(
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
});
