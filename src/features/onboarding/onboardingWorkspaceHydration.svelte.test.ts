import { describe, expect, it, vi } from 'vitest';
import type { Group } from '$lib/stores/groups.svelte';
import type { Personnel } from '$lib/types';
import type { TrainingType } from '$features/training/training.types';
import type {
	OnboardingTemplate,
	OnboardingTemplateStep,
	PersonnelOnboarding
} from '$features/onboarding/onboarding.types';
import type { OnboardingWorkspaceHydration } from './server/onboardingWorkspaceBootstrap';
import {
	createOnboardingWorkspaceHydrator,
	type OnboardingHydrationStores
} from './onboardingWorkspaceHydration.svelte';

function createLoadable<T>() {
	let orgId = '';
	let items: T[] = [];
	let loading = false;
	return {
		get orgId() {
			return orgId;
		},
		get items() {
			return items;
		},
		get loading() {
			return loading;
		},
		loadCount: 0,
		load(nextItems: T[], nextOrgId: string) {
			items = nextItems;
			orgId = nextOrgId;
			loading = false;
			this.loadCount += 1;
		},
		startLoading() {
			loading = true;
		}
	};
}

function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (reason?: unknown) => void;
	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}

function createOnboardingTemplatesLoadable() {
	let orgId = '';
	let templates: OnboardingTemplate[] = [];
	let steps: OnboardingTemplateStep[] = [];
	return {
		get orgId() {
			return orgId;
		},
		get templates() {
			return templates;
		},
		get steps() {
			return steps;
		},
		loadCount: 0,
		load(nextTemplates: OnboardingTemplate[], nextSteps: OnboardingTemplateStep[], nextOrgId: string) {
			templates = nextTemplates;
			steps = nextSteps;
			orgId = nextOrgId;
			this.loadCount += 1;
		}
	};
}

function createStores() {
	return {
		personnelStore: createLoadable<Personnel>(),
		groupsStore: createLoadable<Group>(),
		trainingTypesStore: createLoadable<TrainingType>(),
		onboardingTemplateStore: createOnboardingTemplatesLoadable(),
		onboardingStore: createLoadable<PersonnelOnboarding>()
	} satisfies OnboardingHydrationStores;
}

describe('Onboarding workspace hydration adapter', () => {
	it('hydrates explicit Onboarding workspace targets through the adapter interface', async () => {
		const stores = createStores();
		const personnel = { id: 'p1', firstName: 'John', lastName: 'Smith' } as Personnel;
		const group = { id: 'g1', name: 'Alpha', sortOrder: 0 } as Group;
		const trainingType = { id: 'tt1', name: 'CPR' } as TrainingType;
		const template = {
			id: 'tpl1',
			orgId: 'org-1',
			name: 'Reception',
			description: null,
			createdAt: '2024-01-01'
		} as OnboardingTemplate;
		const step = {
			id: 'step1',
			templateId: 'tpl1',
			name: 'Sign in',
			description: null,
			stepType: 'checkbox',
			trainingTypeId: null,
			stages: null,
			sortOrder: 0
		} as OnboardingTemplateStep;
		const onboarding = {
			id: 'ob1',
			personnelId: 'p1',
			startedAt: '2024-01-01',
			completedAt: null,
			cancelledAt: null,
			status: 'in_progress',
			steps: [],
			templateId: 'tpl1'
		} as PersonnelOnboarding;
		const hydration: OnboardingWorkspaceHydration = {
			orgId: 'org-1',
			personnel: { mode: 'replace', snapshotKey: 'personnel:1', items: [personnel] },
			groups: { mode: 'replace', snapshotKey: 'groups:1', items: [group] },
			trainingTypes: { mode: 'replace', snapshotKey: 'types:1', items: [trainingType] },
			onboardingTemplates: { mode: 'replace', snapshotKey: 'templates:1', templates: [template], steps: [step] },
			onboardings: { mode: 'replace', snapshotKey: 'onboardings:1', items: [onboarding] }
		};

		await createOnboardingWorkspaceHydrator().hydrate(hydration, stores);

		expect(stores.personnelStore.items).toEqual([personnel]);
		expect(stores.groupsStore.items).toEqual([group]);
		expect(stores.trainingTypesStore.items).toEqual([trainingType]);
		expect(stores.onboardingTemplateStore.templates).toEqual([template]);
		expect(stores.onboardingTemplateStore.steps).toEqual([step]);
		expect(stores.onboardingStore.items).toEqual([onboarding]);
		expect(stores.onboardingStore.orgId).toBe('org-1');
	});

	it('ignores stale deferred shared targets when a newer org hydration wins', async () => {
		const stores = createStores();
		const hydrator = createOnboardingWorkspaceHydrator();
		const staleGroups = deferred<Group[]>();
		const freshGroup = { id: 'fresh-group', name: 'Fresh', sortOrder: 1 } as Group;

		const staleHydration: OnboardingWorkspaceHydration = {
			orgId: 'org-old',
			personnel: { mode: 'replace', snapshotKey: 'old-personnel', items: [] },
			groups: { mode: 'replace', deferred: true, snapshotKey: 'old-groups', items: staleGroups.promise },
			trainingTypes: { mode: 'replace', snapshotKey: 'old-types', items: [] },
			onboardingTemplates: { mode: 'replace', snapshotKey: 'old-templates', templates: [], steps: [] },
			onboardings: { mode: 'replace', snapshotKey: 'old-onboardings', items: [] }
		};
		const freshHydration: OnboardingWorkspaceHydration = {
			...staleHydration,
			orgId: 'org-new',
			groups: { mode: 'replace', snapshotKey: 'new-groups', items: [freshGroup] }
		};

		const stalePending = hydrator.hydrate(staleHydration, stores);
		expect(stores.groupsStore.loading).toBe(true);

		await hydrator.hydrate(freshHydration, stores);
		staleGroups.resolve([{ id: 'stale-group', name: 'Stale', sortOrder: 0 } as Group]);
		await stalePending;

		expect(stores.groupsStore.orgId).toBe('org-new');
		expect(stores.groupsStore.items).toEqual([freshGroup]);
	});

	it('clears failed deferred targets so the same snapshot can hydrate after retry', async () => {
		const stores = createStores();
		const hydrator = createOnboardingWorkspaceHydrator();
		const rejectedGroups = deferred<Group[]>();
		const freshGroup = { id: 'fresh-group', name: 'Fresh', sortOrder: 1 } as Group;
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
		const hydration: OnboardingWorkspaceHydration = {
			orgId: 'org-1',
			personnel: { mode: 'replace', snapshotKey: 'personnel:1', items: [] },
			groups: { mode: 'replace', deferred: true, snapshotKey: 'groups:retry', items: rejectedGroups.promise },
			trainingTypes: { mode: 'replace', snapshotKey: 'types:1', items: [] },
			onboardingTemplates: { mode: 'replace', snapshotKey: 'templates:1', templates: [], steps: [] },
			onboardings: { mode: 'replace', snapshotKey: 'onboardings:1', items: [] }
		};

		const pending = hydrator.hydrate(hydration, stores);
		rejectedGroups.reject(new Error('groups failed'));
		await expect(pending).rejects.toThrow('groups failed');

		await hydrator.hydrate(
			{
				...hydration,
				groups: { mode: 'replace', snapshotKey: 'groups:retry', items: [freshGroup] }
			},
			stores
		);

		expect(stores.groupsStore.items).toEqual([freshGroup]);
		expect(stores.groupsStore.orgId).toBe('org-1');
		consoleError.mockRestore();
	});

	it('preserves client-owned Onboarding targets without loading the matching store', async () => {
		const stores = createStores();
		const template = {
			id: 'tpl1',
			orgId: 'org-1',
			name: 'Reception',
			description: null,
			createdAt: '2024-01-01'
		} as OnboardingTemplate;
		const hydration: OnboardingWorkspaceHydration = {
			orgId: 'org-1',
			personnel: { mode: 'replace', snapshotKey: 'personnel:1', items: [] },
			groups: { mode: 'replace', snapshotKey: 'groups:1', items: [] },
			trainingTypes: { mode: 'replace', snapshotKey: 'types:1', items: [] },
			onboardingTemplates: { mode: 'preserve-client', snapshotKey: 'templates:1', templates: [template], steps: [] },
			onboardings: { mode: 'replace', snapshotKey: 'onboardings:1', items: [] }
		};

		await createOnboardingWorkspaceHydrator().hydrate(hydration, stores);

		expect(stores.onboardingTemplateStore.loadCount).toBe(0);
		expect(stores.onboardingTemplateStore.templates).toEqual([]);
	});

	it('skips already-applied Onboarding target snapshots until reset clears adapter state', async () => {
		const stores = createStores();
		const hydrator = createOnboardingWorkspaceHydrator();
		const onboarding = {
			id: 'ob1',
			personnelId: 'p1',
			startedAt: '2024-01-01',
			completedAt: null,
			cancelledAt: null,
			status: 'in_progress',
			steps: [],
			templateId: null
		} as PersonnelOnboarding;
		const hydration: OnboardingWorkspaceHydration = {
			orgId: 'org-1',
			personnel: { mode: 'replace', snapshotKey: 'personnel:1', items: [] },
			groups: { mode: 'replace', snapshotKey: 'groups:1', items: [] },
			trainingTypes: { mode: 'replace', snapshotKey: 'types:1', items: [] },
			onboardingTemplates: { mode: 'replace', snapshotKey: 'templates:1', templates: [], steps: [] },
			onboardings: { mode: 'replace', snapshotKey: 'onboardings:1', items: [onboarding] }
		};

		await hydrator.hydrate(hydration, stores);
		await hydrator.hydrate(hydration, stores);
		expect(stores.onboardingStore.loadCount).toBe(1);

		hydrator.reset();
		await hydrator.hydrate(hydration, stores);
		expect(stores.onboardingStore.loadCount).toBe(2);
	});
});
