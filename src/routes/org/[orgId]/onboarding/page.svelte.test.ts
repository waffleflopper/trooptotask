// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/svelte';
import VisibleStub from '$lib/test-stubs/VisibleStub.svelte';
import type { OnboardingWorkspaceResult } from '$features/onboarding/server/onboardingWorkspaceBootstrap';
import type { PersonnelOnboarding } from '$features/onboarding/onboarding.types';
import { onboardingStore } from '$features/onboarding/stores/onboarding.svelte';
import { onboardingTemplateStore } from '$features/onboarding/stores/onboardingTemplate.svelte';
import { rosterStore } from '$lib/stores/roster.svelte';

const throwRenderErrorMock = vi.fn();
const modalRegistryState = vi.hoisted(() => ({
	startOnboardingOpen: false
}));

vi.mock('$features/onboarding/components/OnboardingModals.svelte', () => ({
	default: VisibleStub
}));

vi.mock('$lib/utils/modalRegistry.svelte', () => ({
	ModalRegistry: class {
		isOpen(id: string) {
			return id === 'startOnboarding' && modalRegistryState.startOnboardingOpen;
		}

		open(id: string) {
			if (id === 'startOnboarding') modalRegistryState.startOnboardingOpen = true;
		}

		close(id: string) {
			if (id === 'startOnboarding') modalRegistryState.startOnboardingOpen = false;
		}

		closerFor(id: string) {
			return () => this.close(id);
		}
	}
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
		orgUrlSegment: 'org-1',
		scopeSet: { kind: 'organization' },
		capabilityMap: {
			calendar: 'configure',
			personnel: 'configure',
			training: 'configure',
			onboarding: 'configure',
			members: 'configure',
			criticalTasks: 'configure',
			ratingScheme: 'configure',
			reports: 'configure'
		},
		hasCapability: vi.fn(() => true),
		affordanceForFeatureAction: vi.fn(() => ({
			visible: true,
			allowed: true,
			disabled: false,
			explanation: null
		}))
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
	modalRegistryState.startOnboardingOpen = false;
	onboardingStore.load([], 'org-test-reset');
	onboardingTemplateStore.load([], [], 'org-test-reset');
	rosterStore.load([], 'org-test-reset');
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

function makeBootstrap(): OnboardingWorkspaceResult {
	return {
		laneKey: 'onboarding',
		data: {
			onboardingTemplates: [],
			onboardingTemplateSteps: [],
			onboardings: [],
			personnel: [],
			groups: [],
			trainingTypes: []
		},
		hydration: {
			orgId: 'org-1',
			personnel: { mode: 'replace', snapshotKey: 'personnel:1', items: [] },
			groups: { mode: 'replace', snapshotKey: 'groups:1', items: [] },
			trainingTypes: { mode: 'replace', snapshotKey: 'training-types:1', items: [] },
			onboardingTemplates: { mode: 'replace', snapshotKey: 'templates:1', templates: [], steps: [] },
			onboardings: { mode: 'replace', snapshotKey: 'onboardings:1', items: [] }
		}
	};
}

function makeOnboarding(overrides: Partial<PersonnelOnboarding> = {}): PersonnelOnboarding {
	return {
		id: 'onboarding-1',
		personnelId: 'personnel-1',
		startedAt: '2026-01-01T00:00:00Z',
		completedAt: null,
		cancelledAt: null,
		status: 'in_progress',
		steps: [],
		templateId: 'template-1',
		...overrides
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
		expect(screen.getByText('Onboarding Pipeline')).toBeTruthy();
	});

	it('loads the modal surface when start onboarding is open', async () => {
		modalRegistryState.startOnboardingOpen = true;

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

		await waitFor(() => {
			expect(screen.getAllByTestId('visible-stub')).toHaveLength(1);
		});
	});

	it('renders a loading shell while onboarding workspace data is still streaming', async () => {
		const deferred = createDeferred<OnboardingWorkspaceResult>();

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
		expect(screen.getByText('Onboarding Pipeline')).toBeTruthy();
	});

	it('renders only active onboardings on the active board when mixed data is seeded', () => {
		rosterStore.load(
			[
				{
					id: 'p-active',
					rank: 'SGT',
					firstName: 'Riley',
					lastName: 'Active',
					mos: '25U',
					clinicRole: 'Signal',
					groupId: 'group-alpha',
					groupName: 'Alpha'
				},
				{
					id: 'p-completed',
					rank: 'SSG',
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
				}
			],
			'org-1'
		);
		onboardingTemplateStore.load(
			[{ id: 'template-1', orgId: 'org-1', name: 'Reception', description: null, createdAt: '2026-01-01' }],
			[
				{
					id: 'template-step-1',
					templateId: 'template-1',
					name: 'Sign in',
					description: null,
					stepType: 'checkbox',
					trainingTypeId: null,
					stages: null,
					sortOrder: 0
				}
			],
			'org-1'
		);
		onboardingStore.load(
			[
				makeOnboarding({ id: 'active-onboarding', personnelId: 'p-active', status: 'in_progress' }),
				makeOnboarding({
					id: 'completed-onboarding',
					personnelId: 'p-completed',
					status: 'completed',
					completedAt: '2026-02-01T00:00:00Z'
				}),
				makeOnboarding({
					id: 'cancelled-onboarding',
					personnelId: 'p-cancelled',
					status: 'cancelled',
					cancelledAt: '2026-02-02T00:00:00Z'
				})
			],
			'org-1'
		);

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

		expect(screen.getByText('1 active')).toBeTruthy();
		expect(screen.getByText('SGT Active, Riley')).toBeTruthy();
		expect(screen.queryByText('SSG Complete, Casey')).toBeNull();
		expect(screen.queryByText('CPL Cancelled, Drew')).toBeNull();
	});

	it('invokes the render error path when onboarding workspace loading fails', async () => {
		const deferred = createDeferred<OnboardingWorkspaceResult>();

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
