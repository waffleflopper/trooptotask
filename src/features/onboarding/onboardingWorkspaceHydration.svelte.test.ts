import { describe, expect, it } from 'vitest';
import type { Group } from '$features/personnel/contracts';
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
});
