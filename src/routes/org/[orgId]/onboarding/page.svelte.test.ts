// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/svelte';
import VisibleStub from '$lib/test-stubs/VisibleStub.svelte';
import type { WorkspaceBootstrap } from '$lib/server/core/orgShell';
import type { OnboardingBootstrap } from '$lib/server/core/useCases/onboardingQuery';

const throwRenderErrorMock = vi.fn();

vi.mock('$features/onboarding/components/OnboardingKanbanView.svelte', () => ({
	default: VisibleStub
}));

vi.mock('$features/onboarding/components/OnboardingModals.svelte', () => ({
	default: VisibleStub
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

vi.mock('$lib/utils/streamedRouteData', async () => {
	const actual = await vi.importActual<typeof import('$lib/utils/streamedRouteData')>('$lib/utils/streamedRouteData');

	return {
		...actual,
		throwRenderError: (error: unknown, fallbackMessage: string) => {
			throwRenderErrorMock(error, fallbackMessage);
			return undefined as never;
		}
	};
});

import Page from './+page.svelte';

afterEach(() => {
	cleanup();
	throwRenderErrorMock.mockReset();
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
	it('renders the page immediately when onboarding workspace data is already resolved', () => {
		render(Page, {
			props: {
				data: {
					session: null,
					onboarding: {
						data: makeBootstrap()
					}
				}
			}
		});

		expect(screen.queryByRole('status')).toBeNull();
		expect(screen.getAllByTestId('visible-stub')).toHaveLength(2);
	});

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
		expect(screen.getAllByTestId('visible-stub')).toHaveLength(2);
	});

	it('invokes the render error path when onboarding workspace loading fails', async () => {
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

		deferred.reject(new Error('onboarding failed'));

		await waitFor(() => {
			expect(throwRenderErrorMock).toHaveBeenCalledWith(
				expect.objectContaining({ message: 'onboarding failed' }),
				'Failed to load onboarding workspace'
			);
		});

		expect(screen.queryByRole('status')).toBeNull();
		expect(screen.queryAllByTestId('visible-stub')).toHaveLength(0);
	});
});
