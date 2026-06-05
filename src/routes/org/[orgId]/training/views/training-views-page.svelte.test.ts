// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Page from './+page.svelte';
import { trainingTypesStore } from '$features/training/stores/trainingTypes.svelte';
import { trainingViewsStore } from '$features/training/stores/trainingViews.svelte';
import type { TrainingWorkspaceResult } from '$features/training/server/trainingWorkspaceBootstrap';

vi.mock('$lib/stores/orgContext.svelte', () => ({
	getOrgContext: () => ({
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
});
