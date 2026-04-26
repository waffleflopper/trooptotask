// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/svelte';
import DashboardTabs from './DashboardTabs.svelte';
import { dashboardTabStore } from '../stores/dashboardTabStore.svelte';

afterEach(() => {
	cleanup();
	dashboardTabStore.setTab('unit-readiness');
});

describe('DashboardTabs', () => {
	it('routes Add Eval through the first-class Evals route when the member can view rating scheme', () => {
		dashboardTabStore.setTab('training-evals');

		render(DashboardTabs, {
			props: {
				orgId: 'org-1',
				permissions: {
					canViewTraining: true,
					canViewRatingScheme: true
				}
			}
		});

		expect(
			screen
				.getAllByRole('link', { name: 'Add Eval' })
				.every((link) => link.getAttribute('href') === '/org/org-1/evals')
		).toBe(true);
	});

	it('hides Add Eval when the member lacks rating-scheme view access', () => {
		dashboardTabStore.setTab('training-evals');

		render(DashboardTabs, {
			props: {
				orgId: 'org-1',
				permissions: {
					canViewTraining: true,
					canViewRatingScheme: false
				}
			}
		});

		expect(screen.queryByRole('link', { name: 'Add Eval' })).toBeNull();
	});
});
