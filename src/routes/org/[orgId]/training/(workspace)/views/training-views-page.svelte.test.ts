// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Page from './+page.svelte';
import TrainingRoute from '../trainingRoute.test.svelte';
import { trainingTypesStore } from '$features/training';
import { trainingViewsStore } from '$features/training';
import type { TrainingWorkspaceResult } from '$features/training/contracts';

vi.mock('$features/app-shell', () => ({
	getAppShellContext: () => ({
		orgId: 'org-1',
		orgName: 'Test Unit',
		affordanceForFeatureAction: () => ({
			allowed: true,
			visible: true,
			disabled: false,
			reason: 'allowed:capability',
			explanation: '',
			decision: {}
		})
	})
}));

function makeDeferredBootstrap(): TrainingWorkspaceResult {
	const deferredItems = Promise.resolve([]);
	const data = {
		personnel: deferredItems,
		groups: deferredItems,
		trainingTypes: deferredItems,
		trainingViews: deferredItems,
		personnelTrainings: deferredItems,
		pinnedGroups: deferredItems
	};

	return {
		laneKey: 'training',
		data,
		hydration: {
			orgId: 'org-1',
			personnel: { mode: 'replace', snapshotKey: 'personnel:1', items: data.personnel },
			groups: { mode: 'replace', snapshotKey: 'groups:1', items: data.groups },
			trainingTypes: { mode: 'replace', snapshotKey: 'types:1', items: data.trainingTypes },
			trainingViews: { mode: 'replace', snapshotKey: 'views:1', items: data.trainingViews },
			personnelTrainings: { mode: 'replace', snapshotKey: 'trainings:1', items: data.personnelTrainings },
			pinnedGroups: { mode: 'replace', snapshotKey: 'pinned:1', items: data.pinnedGroups }
		}
	};
}

describe('training views page', () => {
	beforeEach(() => {
		trainingTypesStore.load([], 'org-stale');
		trainingViewsStore.load([], 'org-stale');
	});

	afterEach(() => {
		cleanup();
		trainingTypesStore.load([], 'org-test-reset');
		trainingViewsStore.load([], 'org-test-reset');
	});

	it('keeps the route loading state until current-org training view stores hydrate', async () => {
		render(Page, {
			props: {
				data: {
					training: {
						data: Promise.resolve(makeDeferredBootstrap())
					}
				}
			}
		});

		expect(await screen.findByText('Loading training views...')).toBeTruthy();
		expect(screen.queryByText('No saved views yet.')).toBeNull();
	});

	it('shows the Training load error with Retry and never a stuck loading status when the source rejects', async () => {
		const reload = vi.fn();
		vi.stubGlobal('location', { ...window.location, reload });
		const rejected = Promise.reject(new Error('personnel_trainings failed'));
		rejected.catch(() => {});

		render(TrainingRoute, {
			props: { Page, data: { shell: { org: { id: 'org-1' } }, training: { data: rejected } } as never }
		});

		expect((await screen.findByRole('alert')).textContent).toContain('Unable to load Training');
		expect(screen.queryByRole('status')).toBeNull();
		await fireEvent.click(screen.getByRole('button', { name: 'Retry Training' }));
		expect(reload).toHaveBeenCalledTimes(1);
		vi.unstubAllGlobals();
	});
});
