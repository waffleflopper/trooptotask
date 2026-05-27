import { describe, expect, it, vi } from 'vitest';
import { error, type Cookies } from '@sveltejs/kit';
import { createInMemoryOrgWorkspacePort } from '$lib/server/adapters/inMemoryOrgShell';
import { createDefaultHydrationPlanner } from '$lib/server/core/hydrationPlanner';
import type { Group } from '$lib/stores/groups.svelte';
import type { WorkspaceBootstrap, WorkspaceKey } from '$lib/server/core/orgShell';
import type { OnboardingBootstrap } from '$lib/server/core/useCases/onboardingQuery';
import type {
	OnboardingTemplate,
	OnboardingTemplateStep,
	PersonnelOnboarding
} from '$features/onboarding/onboarding.types';
import type { TrainingType } from '$features/training/training.types';
import type { Personnel } from '$lib/types';
import { _createOnboardingLayoutLoad } from './+layout.server';

describe('onboarding layout server load', () => {
	it('registers onboarding dependencies and streams the canonical onboarding workspace payload', async () => {
		const onboardingData: OnboardingBootstrap = {
			onboardingTemplates: [
				{
					id: 'tpl1',
					orgId: 'org-1',
					name: 'Reception',
					description: null,
					createdAt: '2024-01-01'
				} satisfies OnboardingTemplate
			],
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
				} satisfies OnboardingTemplateStep
			],
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
				} satisfies PersonnelOnboarding
			],
			trainingTypes: [{ id: 'tt1', name: 'CPR' } as TrainingType],
			personnel: [{ id: 'p1', firstName: 'John', lastName: 'Smith' } as Personnel],
			groups: [{ id: 'g1', name: 'Alpha', sortOrder: 0 } as Group]
		};
		const depends = vi.fn();
		const workspacePort = createInMemoryOrgWorkspacePort(
			new Map<WorkspaceKey, unknown>([['onboarding', onboardingData]])
		);
		const plannerPort = createDefaultHydrationPlanner('org-1');
		const createWorkspacePort = vi.fn().mockReturnValue(workspacePort);
		const createPlannerPort = vi.fn().mockReturnValue(plannerPort);
		const authorizeAccess = vi.fn().mockResolvedValue(undefined);
		const load = _createOnboardingLayoutLoad({
			createWorkspacePort,
			createPlannerPort,
			authorizeAccess
		});
		const locals = {} as App.Locals;
		const cookies = {} as Cookies;

		const result = await load({
			params: { orgId: 'org-1' },
			locals,
			cookies,
			depends
		} as unknown as Parameters<typeof load>[0]);
		if (!result) {
			throw new Error('Expected onboarding layout load to return data');
		}

		expect(depends).toHaveBeenCalledTimes(1);
		expect(depends).toHaveBeenCalledWith('app:org-core', 'app:onboarding-data');
		expect(authorizeAccess).toHaveBeenCalledWith({ locals, cookies, orgId: 'org-1' });
		expect(createWorkspacePort).toHaveBeenCalledWith({ locals, cookies, orgId: 'org-1' });
		expect(createPlannerPort).toHaveBeenCalledWith('org-1');
		expect(result.onboarding.data).toBeInstanceOf(Promise);

		await expect(result.onboarding.data).resolves.toMatchObject({
			workspace: 'onboarding',
			data: onboardingData,
			hydration: {
				orgId: 'org-1',
				trainingTypes: expect.objectContaining({
					mode: 'replace',
					items: onboardingData.trainingTypes,
					deferred: false,
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
					deferred: false,
					snapshotKey: expect.any(String)
				})
			}
		} satisfies WorkspaceBootstrap<OnboardingBootstrap>);
	});

	it('throws a route-level permission error before starting streamed onboarding data', async () => {
		const depends = vi.fn();
		const createWorkspacePort = vi.fn();
		const createPlannerPort = vi.fn();
		const authorizeAccess = vi.fn(async () => {
			throw error(403, 'No onboarding access');
		});
		const load = _createOnboardingLayoutLoad({
			createWorkspacePort,
			createPlannerPort,
			authorizeAccess
		});
		const locals = {} as App.Locals;
		const cookies = {} as Cookies;

		try {
			await load({
				params: { orgId: 'org-1' },
				locals,
				cookies,
				depends
			} as unknown as Parameters<typeof load>[0]);
			throw new Error('Expected onboarding layout load to throw');
		} catch (err) {
			expect((err as { status?: number }).status).toBe(403);
		}

		expect(depends).toHaveBeenCalledWith('app:org-core', 'app:onboarding-data');
		expect(authorizeAccess).toHaveBeenCalledWith({ locals, cookies, orgId: 'org-1' });
		expect(createWorkspacePort).not.toHaveBeenCalled();
		expect(createPlannerPort).not.toHaveBeenCalled();
	});
});
