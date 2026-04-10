// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Page from './+page.svelte';
import { personnelStore } from '$features/personnel/stores/personnel.svelte';
import { trainingTypesStore } from '$features/training/stores/trainingTypes.svelte';
import type { WorkspaceBootstrap } from '$lib/server/core/orgShell';
import type { TrainingBootstrap } from '$lib/server/core/useCases/trainingQuery';

vi.mock('$lib/stores/orgContext.svelte', () => ({
	getOrgContext: () => ({
		orgId: 'org-1',
		orgName: 'Test Unit',
		userId: 'user-1',
		role: 'owner',
		isOwner: true,
		isAdmin: false,
		isPrivileged: true,
		isFullEditor: true,
		permissions: {
			canViewCalendar: true,
			canEditCalendar: true,
			canViewPersonnel: true,
			canEditPersonnel: true,
			canViewTraining: true,
			canEditTraining: true,
			canViewOnboarding: true,
			canEditOnboarding: true,
			canViewLeadersBook: true,
			canEditLeadersBook: true,
			canManageMembers: true
		},
		scopedGroupId: null,
		readOnly: false
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

describe('training types page', () => {
	beforeEach(() => {
		personnelStore.load([], 'org-stale');
		trainingTypesStore.load([], 'org-stale');
	});

	afterEach(() => {
		cleanup();
		personnelStore.load([], 'org-test-reset');
		trainingTypesStore.load([], 'org-test-reset');
	});

	it('keeps the route loading state until current-org training type stores hydrate', async () => {
		render(Page, {
			props: {
				data: {
					training: {
						data: Promise.resolve(makeDeferredBootstrap())
					}
				}
			}
		});

		expect(await screen.findByText('Loading training types...')).toBeTruthy();
		expect(screen.queryByText('No training types yet. Create one to get started.')).toBeNull();
	});
});
