import { describe, expect, it, vi } from 'vitest';
import type { Cookies } from '@sveltejs/kit';
import type {
	OnboardingTemplate,
	OnboardingTemplateStep,
	PersonnelOnboarding
} from '$features/onboarding/onboarding.types';
import type { OnboardingWorkspaceRouteData } from '$features/onboarding/server/onboardingWorkspaceBootstrap';
import type { TrainingType } from '$features/training/training.types';
import { createReadyAppShellRouteData } from '$lib/test-support/appShellRouteData';
import type { Group } from '$lib/stores/groups.svelte';
import type { Personnel } from '$lib/types';
import { _createOnboardingLayoutLoad } from './+layout.server';

describe('onboarding layout server load', () => {
	it('registers onboarding dependencies and streams the canonical onboarding workspace payload', async () => {
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
		const depends = vi.fn();
		const streamOnboardingWorkspace = vi.fn().mockResolvedValue({
			onboarding: {
				data: Promise.resolve({
					laneKey: 'onboarding',
					data: onboardingData,
					hydration: {
						orgId: 'org-1',
						personnel: { mode: 'replace', items: onboardingData.personnel, snapshotKey: 'personnel:1' },
						groups: { mode: 'replace', items: onboardingData.groups, snapshotKey: 'groups:1' },
						trainingTypes: { mode: 'replace', items: onboardingData.trainingTypes, snapshotKey: 'types:1' },
						onboardingTemplates: {
							mode: 'replace',
							templates: onboardingData.onboardingTemplates,
							steps: onboardingData.onboardingTemplateSteps,
							snapshotKey: 'templates:1'
						},
						onboardings: { mode: 'replace', items: onboardingData.onboardings, snapshotKey: 'onboardings:1' }
					}
				})
			}
		} satisfies OnboardingWorkspaceRouteData);
		const load = _createOnboardingLayoutLoad({
			streamOnboardingWorkspace
		});
		const locals = {} as App.Locals;
		const cookies = {} as Cookies;
		const parent = vi.fn().mockResolvedValue(createReadyAppShellRouteData({ orgId: 'org-1' }));

		const result = await load({
			params: { orgId: '1-11-bde' },
			locals,
			cookies,
			depends,
			parent
		} as unknown as Parameters<typeof load>[0]);
		if (!result) {
			throw new Error('Expected onboarding layout load to return data');
		}

		expect(depends).toHaveBeenCalledTimes(1);
		expect(depends).toHaveBeenCalledWith('app:org-core', 'app:onboarding-data');
		expect(parent).toHaveBeenCalledTimes(1);
		expect(streamOnboardingWorkspace).toHaveBeenCalledWith({ locals, cookies, orgId: 'org-1' });
		expect(result.onboarding.data).toBeInstanceOf(Promise);

		await expect(result.onboarding.data).resolves.toMatchObject({
			laneKey: 'onboarding',
			data: onboardingData,
			hydration: {
				orgId: 'org-1',
				onboardings: expect.objectContaining({
					mode: 'replace',
					items: onboardingData.onboardings,
					snapshotKey: 'onboardings:1'
				})
			}
		});
	});
});
