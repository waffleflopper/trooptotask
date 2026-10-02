import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OnboardingTemplate, OnboardingTemplateStep, PersonnelOnboarding } from '../contracts';
import type { TrainingType } from '$features/training/contracts';
import type { Group } from '$features/personnel/contracts';
import type { Personnel } from '$features/personnel/contracts';

const { fetchOnboardingBootstrapMock, mockCtx } = vi.hoisted(() => {
	const fetchOnboardingBootstrapMock = vi.fn();

	return {
		fetchOnboardingBootstrapMock,
		mockCtx: {
			auth: {
				orgId: '11111111-1111-1111-1111-111111111111'
			}
		}
	};
});

vi.mock('./onboardingQuery.server', async () => {
	const actual = await vi.importActual<typeof import('./onboardingQuery.server')>('./onboardingQuery.server');
	return {
		...actual,
		fetchOnboardingBootstrap: fetchOnboardingBootstrapMock
	};
});

import { fetchOnboardingWorkspace } from './onboardingWorkspaceBootstrap.server';

describe('fetchOnboardingWorkspace', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('streams a lane-keyed Onboarding workspace result with explicit Onboarding hydration targets', async () => {
		const onboardingData = {
			onboardingTemplates: [
				{ id: 'tpl1', orgId: 'org-1', name: 'Reception', description: null, createdAt: '2024-01-01' }
			] as OnboardingTemplate[],
			onboardingTemplateSteps: [
				{
					id: 'step1',
					templateId: 'tpl1',
					name: 'Sign in',
					description: null,
					stepType: 'checkbox',
					trainingTypeId: null,
					stages: null,
					sortOrder: 0
				}
			] as OnboardingTemplateStep[],
			onboardings: [
				{
					id: 'ob1',
					personnelId: 'p1',
					startedAt: '2024-01-01',
					completedAt: null,
					cancelledAt: null,
					status: 'in_progress',
					steps: [],
					templateId: 'tpl1'
				}
			] as PersonnelOnboarding[],
			personnel: [{ id: 'p1', firstName: 'John', lastName: 'Smith' } as Personnel],
			groups: [{ id: 'g1', name: 'Alpha', sortOrder: 0 } as Group],
			rankCatalogUnavailable: false,
			rankCatalog: [],
			trainingTypes: [{ id: 'tt1', name: 'CPR' } as TrainingType]
		};
		fetchOnboardingBootstrapMock.mockResolvedValue(onboardingData);

		const workspace = await fetchOnboardingWorkspace(mockCtx as never);

		expect(workspace).toMatchObject({
			laneKey: 'onboarding',
			data: onboardingData,
			hydration: {
				orgId: '11111111-1111-1111-1111-111111111111',
				personnel: expect.objectContaining({
					mode: 'replace',
					items: onboardingData.personnel,
					snapshotKey: expect.any(String)
				}),
				groups: expect.objectContaining({
					mode: 'replace',
					items: onboardingData.groups,
					snapshotKey: expect.any(String)
				}),
				trainingTypes: expect.objectContaining({
					mode: 'replace',
					items: onboardingData.trainingTypes,
					snapshotKey: expect.any(String)
				}),
				onboardingTemplates: expect.objectContaining({
					mode: 'replace',
					templates: onboardingData.onboardingTemplates,
					steps: onboardingData.onboardingTemplateSteps,
					snapshotKey: expect.any(String)
				}),
				onboardings: expect.objectContaining({
					mode: 'replace',
					items: onboardingData.onboardings,
					snapshotKey: expect.any(String)
				})
			}
		});
		expect(workspace.hydration.onboardingTemplates.snapshotKey).not.toContain('Reception');
		expect(workspace.hydration.personnel.snapshotKey).not.toContain('Smith');
	});

	it('hydrates historical onboarding records when history mode is requested', async () => {
		const activeData = {
			onboardingTemplates: [] as OnboardingTemplate[],
			onboardingTemplateSteps: [] as OnboardingTemplateStep[],
			onboardings: [
				{
					id: 'active-onboarding',
					personnelId: 'p-active',
					startedAt: '2024-01-01',
					completedAt: null,
					cancelledAt: null,
					status: 'in_progress',
					steps: [],
					templateId: null
				}
			] as PersonnelOnboarding[],
			personnel: [] as Personnel[],
			groups: [] as Group[],
			trainingTypes: [] as TrainingType[],
			rankCatalogUnavailable: false,
			rankCatalog: []
		};
		const historyData = {
			...activeData,
			onboardings: [
				{
					id: 'completed-onboarding',
					personnelId: 'p-completed',
					startedAt: '2024-01-01',
					completedAt: '2024-02-01',
					cancelledAt: null,
					status: 'completed',
					steps: [],
					templateId: null
				}
			] as PersonnelOnboarding[]
		};
		fetchOnboardingBootstrapMock.mockImplementation((_ctx, options) =>
			Promise.resolve(options?.mode === 'history' ? historyData : activeData)
		);

		const workspace = await fetchOnboardingWorkspace(mockCtx as never, { mode: 'history' });

		expect(workspace.data.onboardings).toEqual([
			expect.objectContaining({ id: 'completed-onboarding', status: 'completed' })
		]);
		expect(workspace.hydration.onboardings.items).toEqual(workspace.data.onboardings);
	});
});
