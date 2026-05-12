// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Page from './+page.svelte';
import { trainingTypesStore } from '$features/training/stores/trainingTypes.svelte';
import { trainingViewsStore } from '$features/training/stores/trainingViews.svelte';
import type { WorkspaceBootstrap } from '$lib/server/core/orgShell';
import type { TrainingBootstrap } from '$lib/server/core/useCases/trainingQuery';

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

function makeDeferredBootstrap(): WorkspaceBootstrap<TrainingBootstrap> {
	const deferredItems = Promise.resolve([]);

	return {
		workspace: 'training',
		data: {
			personnel: deferredItems,
			groups: deferredItems,
			trainingTypes: deferredItems,
			trainingViews: deferredItems,
			personnelTrainings: deferredItems,
			pinnedGroups: deferredItems
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
