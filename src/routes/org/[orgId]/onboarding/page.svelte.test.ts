// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/svelte';
import PassiveStub from '$features/duty-roster/components/test-stubs/PassiveStub.svelte';
import type { WorkspaceBootstrap } from '$lib/server/core/orgShell';
import type { OnboardingBootstrap } from '$lib/server/core/useCases/onboardingQuery';

vi.mock('$features/onboarding/components/OnboardingPageView.svelte', () => ({
	default: PassiveStub
}));

vi.mock('$features/onboarding/components/OnboardingModals.svelte', () => ({
	default: PassiveStub
}));

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
		scopedGroupId: null,
		readOnly: false,
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
		}
	})
}));

import Page from './+page.svelte';

afterEach(() => {
	cleanup();
});

function createDeferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (reason?: unknown) => void;
	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});

	return {
		promise,
		resolve,
		reject
	};
}

function makeBootstrap(): WorkspaceBootstrap<OnboardingBootstrap> {
	return {
		workspace: 'onboarding',
		data: {
			onboardingTemplates: [],
			onboardingTemplateSteps: [],
			onboardings: [],
			personnel: [],
			groups: [],
			trainingTypes: []
		}
	};
}

describe('onboarding page', () => {
	it('renders a loading shell while onboarding workspace data is still streaming', async () => {
		const deferred = createDeferred<WorkspaceBootstrap<OnboardingBootstrap>>();

		render(Page, {
			props: {
				data: {
					session: null,
					onboarding: {
						data: deferred.promise
					}
				}
			}
		});

		expect(screen.getByRole('status')).toBeTruthy();

		deferred.resolve(makeBootstrap());

		await waitFor(() => {
			expect(screen.queryByRole('status')).toBeNull();
		});
	});
});
