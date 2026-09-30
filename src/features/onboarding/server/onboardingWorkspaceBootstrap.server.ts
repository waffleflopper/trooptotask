import { fetchOnboardingBootstrap } from '$lib/server/core/useCases/onboardingQuery';
import {
	ONBOARDING_WORKSPACE_LANE_KEY,
	type OnboardingBootstrapMode,
	type OnboardingWorkspaceData,
	type OnboardingWorkspaceHydrationTarget,
	type OnboardingTemplatesWorkspaceHydrationTarget,
	type OnboardingWorkspaceHydration,
	type OnboardingWorkspaceResult
} from '../contracts';

export interface OnboardingWorkspaceBootstrapOptions {
	mode?: OnboardingBootstrapMode;
}

function createHydrationTarget<T>(items: T[]): OnboardingWorkspaceHydrationTarget<T> {
	return { mode: 'replace', snapshotKey: `resolved:${crypto.randomUUID()}`, items };
}

function createTemplatesHydrationTarget(data: OnboardingWorkspaceData): OnboardingTemplatesWorkspaceHydrationTarget {
	const templates = data.onboardingTemplates;
	const steps = data.onboardingTemplateSteps;

	return {
		mode: 'replace',
		snapshotKey: `resolved:${crypto.randomUUID()}`,
		templates,
		steps
	};
}

function createOnboardingWorkspaceHydration(
	orgId: string,
	data: OnboardingWorkspaceData
): OnboardingWorkspaceHydration {
	return {
		orgId,
		personnel: createHydrationTarget(data.personnel),
		groups: createHydrationTarget(data.groups),
		trainingTypes: createHydrationTarget(data.trainingTypes),
		onboardingTemplates: createTemplatesHydrationTarget(data),
		onboardings: createHydrationTarget(data.onboardings)
	};
}

export async function fetchOnboardingWorkspace(
	ctx: Parameters<typeof fetchOnboardingBootstrap>[0],
	options: OnboardingWorkspaceBootstrapOptions = {}
): Promise<OnboardingWorkspaceResult> {
	const data = await fetchOnboardingBootstrap(ctx, options);
	return {
		laneKey: ONBOARDING_WORKSPACE_LANE_KEY,
		data,
		hydration: createOnboardingWorkspaceHydration(ctx.auth.orgId, data)
	};
}
