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
	it('renders only the dashboard view controls', () => {
		dashboardTabStore.setTab('training-evals');

		render(DashboardTabs, {
			props: {
				orgId: 'org-1'
			}
		});

		expect(screen.getAllByRole('button', { name: 'Training & Evals' }).length).toBeGreaterThan(0);
		expect(screen.queryByRole('link', { name: 'Add Eval' })).toBeNull();
	});
});
