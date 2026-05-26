import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Cookies } from '@sveltejs/kit';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import type { OnboardingBootstrap } from '$lib/server/core/useCases/onboardingQuery';

const { loadWithContextMock } = vi.hoisted(() => {
	const loadWithContextMock = vi.fn();

	return {
		loadWithContextMock
	};
});

vi.mock('./httpAdapter', async () => {
	const actual = await vi.importActual<typeof import('./httpAdapter')>('./httpAdapter');
	return {
		...actual,
		loadWithContext: loadWithContextMock
	};
});

import { createSupabaseOnboardingWorkspacePort } from './supabaseOrgShell';

describe('createSupabaseOnboardingWorkspacePort', () => {
	const onboardingBootstrap: OnboardingBootstrap = {
		onboardingTemplates: [],
		onboardingTemplateSteps: [],
		onboardings: [],
		personnel: [],
		groups: [],
		trainingTypes: []
	};

	beforeEach(() => {
		vi.clearAllMocks();
		loadWithContextMock.mockImplementation((_locals, _cookies, _orgId, config) => {
			const data = Promise.resolve(onboardingBootstrap);
			return config.defer ? Promise.resolve({ data }) : data;
		});
	});

	it('streams onboarding bootstrap data through the deferred workspace API', async () => {
		const port = createSupabaseOnboardingWorkspacePort(
			{} as App.Locals,
			{} as Cookies,
			'11111111-1111-1111-1111-111111111111'
		);

		const streamed = await port.streamWorkspaceData<OnboardingBootstrap>('onboarding');

		await expect(streamed.data).resolves.toEqual(onboardingBootstrap);
		expect(loadWithContextMock).toHaveBeenCalledWith(
			expect.anything(),
			expect.anything(),
			'11111111-1111-1111-1111-111111111111',
			expect.objectContaining({
				policyAction: POLICY_ACTION_CATALOG.onboarding.viewWorkflows,
				policyResource: { kind: 'unscoped' },
				defer: true,
				fn: expect.any(Function)
			})
		);
		expect(loadWithContextMock.mock.calls[0]?.[3]).not.toHaveProperty('permission');
	});
});
