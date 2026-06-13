import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Cookies } from '@sveltejs/kit';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import type {
	OnboardingTemplate,
	OnboardingTemplateStep,
	PersonnelOnboarding
} from '$features/onboarding/onboarding.types';
import type { TrainingType } from '$features/training/training.types';
import type { Group } from '$lib/stores/groups.svelte';
import type { Personnel } from '$lib/types';

const { fetchOnboardingBootstrapMock, loadWithContextMock, mockCtx } = vi.hoisted(() => {
	const fetchOnboardingBootstrapMock = vi.fn();
	const loadWithContextMock = vi.fn();

	return {
		fetchOnboardingBootstrapMock,
		loadWithContextMock,
		mockCtx: {
			auth: {
				orgId: '11111111-1111-1111-1111-111111111111'
			}
		}
	};
});

vi.mock('$lib/server/adapters/httpAdapter', async () => {
	const actual = await vi.importActual<typeof import('$lib/server/adapters/httpAdapter')>(
		'$lib/server/adapters/httpAdapter'
	);
	return {
		...actual,
		loadWithContext: loadWithContextMock
	};
});

vi.mock('$lib/server/core/useCases/onboardingQuery', async () => {
	const actual = await vi.importActual<typeof import('$lib/server/core/useCases/onboardingQuery')>(
		'$lib/server/core/useCases/onboardingQuery'
	);
	return {
		...actual,
		fetchOnboardingBootstrap: fetchOnboardingBootstrapMock
	};
});

import { streamOnboardingWorkspaceBootstrap } from './onboardingWorkspaceBootstrap';

describe('streamOnboardingWorkspaceBootstrap', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		loadWithContextMock.mockImplementation((_locals, _cookies, _orgId, config) => {
			const data = config.fn(mockCtx as never);
			return config.defer ? { data } : data;
		});
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
			trainingTypes: [{ id: 'tt1', name: 'CPR' } as TrainingType]
		};
		fetchOnboardingBootstrapMock.mockResolvedValue(onboardingData);

		const routeData = await streamOnboardingWorkspaceBootstrap({
			locals: {} as App.Locals,
			cookies: {} as Cookies,
			orgId: '1-11-bde'
		});

		expect(loadWithContextMock).toHaveBeenCalledWith(
			expect.anything(),
			expect.anything(),
			'1-11-bde',
			expect.objectContaining({
				policyAction: POLICY_ACTION_CATALOG.onboarding.viewWorkflows,
				policyResource: { kind: 'unscoped' },
				defer: true
			})
		);
		expect(loadWithContextMock.mock.calls[0]?.[3]).not.toHaveProperty('permission');
		expect(routeData.onboarding.data).toBeInstanceOf(Promise);

		await expect(routeData.onboarding.data).resolves.toMatchObject({
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
		const workspace = await routeData.onboarding.data;
		expect(fetchOnboardingBootstrapMock).toHaveBeenCalledWith(mockCtx, {});
		expect(workspace.hydration.onboardingTemplates.snapshotKey).not.toContain('Reception');
		expect(workspace.hydration.personnel.snapshotKey).not.toContain('Smith');
	});

	it('passes the requested onboarding bootstrap mode to the query use case', async () => {
		const onboardingData = {
			onboardingTemplates: [] as OnboardingTemplate[],
			onboardingTemplateSteps: [] as OnboardingTemplateStep[],
			onboardings: [] as PersonnelOnboarding[],
			personnel: [] as Personnel[],
			groups: [] as Group[],
			trainingTypes: [] as TrainingType[]
		};
		fetchOnboardingBootstrapMock.mockResolvedValue(onboardingData);

		const routeData = await streamOnboardingWorkspaceBootstrap(
			{
				locals: {} as App.Locals,
				cookies: {} as Cookies,
				orgId: '1-11-bde'
			},
			{ mode: 'history' }
		);

		await routeData.onboarding.data;

		expect(fetchOnboardingBootstrapMock).toHaveBeenCalledWith(mockCtx, { mode: 'history' });
	});
});
