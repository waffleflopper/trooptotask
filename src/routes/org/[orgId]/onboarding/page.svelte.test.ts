// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import VisibleStub from '$lib/test-stubs/VisibleStub.svelte';
import type { OnboardingWorkspaceResult } from '$features/onboarding/contracts';
import type { PersonnelOnboarding } from '$features/onboarding/contracts';
import { onboardingStore, onboardingTemplateStore } from '$features/onboarding';
import { personnelRosterHydration } from '$features/personnel';

const modalRegistryState = vi.hoisted(() => ({
	startOnboardingOpen: false
}));

vi.mock('$features/onboarding', async () => {
	const actual = await vi.importActual<typeof import('$features/onboarding')>('$features/onboarding');
	return { ...actual, loadOnboardingModals: async () => ({ default: VisibleStub }) };
});

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

vi.mock('$features/app-shell', () => ({
	getAppShellContext: () => ({
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

import Page from './+page.svelte';
import OnboardingRoute from './onboardingRoute.test.svelte';

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
	modalRegistryState.startOnboardingOpen = false;
	onboardingStore.load([], 'org-test-reset');
	onboardingTemplateStore.load([], [], 'org-test-reset');
	personnelRosterHydration.load([], 'org-test-reset');
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
			trainingTypes: [],
			rankCatalogUnavailable: false,
			rankCatalog: [],
			typicalDaysToFinish: null
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
		expect(screen.getByRole('heading', { name: 'Onboarding' })).toBeTruthy();
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

		expect(screen.getByRole('status', { name: 'Loading onboarding' })).toBeTruthy();

		deferred.resolve(makeBootstrap());

		await waitFor(() => {
			expect(screen.queryByRole('status')).toBeNull();
		});
		expect(screen.getByRole('heading', { name: 'Onboarding' })).toBeTruthy();
	});

	it('lists only in-progress onboardings when mixed data is seeded', () => {
		personnelRosterHydration.load(
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

		expect(screen.getByText('1 Soldier in processing')).toBeTruthy();
		expect(screen.getByText('SGT Active, Riley')).toBeTruthy();
		expect(screen.queryByText('SSG Complete, Casey')).toBeNull();
		expect(screen.queryByText('CPL Cancelled, Drew')).toBeNull();
	});

	it('shows the Onboarding load error with Retry and never a stuck loading status when the source rejects', async () => {
		const reload = vi.fn();
		vi.stubGlobal('location', { ...window.location, reload });
		const rejected = Promise.reject(new Error('onboarding failed'));
		rejected.catch(() => {});

		render(OnboardingRoute, {
			props: { Page, data: { shell: { org: { id: 'org-1' } }, session: null, onboarding: { data: rejected } } as never }
		});

		expect((await screen.findByRole('alert')).textContent).toContain('Unable to load Onboarding');
		expect(screen.queryByRole('status')).toBeNull();
		expect(screen.queryByRole('heading', { name: 'Onboarding' })).toBeNull();
		await fireEvent.click(screen.getByRole('button', { name: 'Retry Onboarding' }));
		expect(reload).toHaveBeenCalledTimes(1);
	});

	it('renders nothing from the page itself when the source rejects, leaving the error to the layout', async () => {
		const rejected = Promise.reject(new Error('onboarding failed'));
		rejected.catch(() => {});

		render(Page, { props: { data: { session: null, onboarding: { data: rejected } } } });

		await waitFor(() => expect(screen.queryByRole('status')).toBeNull());
		expect(screen.queryByRole('alert')).toBeNull();
		expect(screen.queryByRole('heading', { name: 'Onboarding' })).toBeNull();
		expect(screen.queryAllByTestId('visible-stub')).toHaveLength(0);
	});
});
