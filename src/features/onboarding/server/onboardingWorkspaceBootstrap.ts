import type { Cookies } from '@sveltejs/kit';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { loadWithContext } from '$lib/server/adapters/httpAdapter';
import type { DeferredData, HydrationItems } from '$lib/server/core/streamedWorkspace';
import { fetchOnboardingBootstrap, type OnboardingBootstrap } from '$lib/server/core/useCases/onboardingQuery';
import type {
	OnboardingTemplate,
	OnboardingTemplateStep,
	PersonnelOnboarding
} from '$features/onboarding/onboarding.types';
import type { TrainingType } from '$features/training/training.types';
import type { Group } from '$lib/stores/groups.svelte';
import type { Personnel } from '$lib/types';

export const ONBOARDING_WORKSPACE_LANE_KEY = 'onboarding' as const;

export interface OnboardingWorkspaceRequestContext {
	locals: App.Locals;
	cookies: Cookies;
	orgId: string;
}

export type OnboardingWorkspaceData = OnboardingBootstrap;

export type OnboardingWorkspaceHydrationMode = 'replace' | 'preserve-client';

export interface OnboardingWorkspaceHydrationTarget<T> {
	mode: OnboardingWorkspaceHydrationMode;
	deferred?: boolean;
	snapshotKey: string;
	items: HydrationItems<T>;
}

export interface OnboardingTemplatesWorkspaceHydrationTarget {
	mode: OnboardingWorkspaceHydrationMode;
	deferred?: boolean;
	snapshotKey: string;
	templates: OnboardingTemplate[];
	steps: OnboardingTemplateStep[];
}

export interface OnboardingWorkspaceHydration {
	orgId: string;
	personnel: OnboardingWorkspaceHydrationTarget<Personnel>;
	groups: OnboardingWorkspaceHydrationTarget<Group>;
	trainingTypes: OnboardingWorkspaceHydrationTarget<TrainingType>;
	onboardingTemplates: OnboardingTemplatesWorkspaceHydrationTarget;
	onboardings: OnboardingWorkspaceHydrationTarget<PersonnelOnboarding>;
}

export interface OnboardingWorkspaceResult {
	laneKey: typeof ONBOARDING_WORKSPACE_LANE_KEY;
	data: OnboardingWorkspaceData;
	hydration: OnboardingWorkspaceHydration;
}

export interface OnboardingWorkspaceRouteData {
	[ONBOARDING_WORKSPACE_LANE_KEY]: DeferredData<OnboardingWorkspaceResult>;
}

const deferredSnapshotKeys = new WeakMap<object, string>();
let fallbackSnapshotCounter = 0;

function isPromiseLike<T>(value: unknown): value is Promise<T> {
	return !!value && typeof value === 'object' && typeof (value as { then?: unknown }).then === 'function';
}

function generateSnapshotId(prefix: string): string {
	const randomId = globalThis.crypto?.randomUUID?.();
	if (randomId) {
		return `${prefix}:${randomId}`;
	}

	fallbackSnapshotCounter = (fallbackSnapshotCounter + 1) % 1_000_000;
	return `${prefix}:fallback:${fallbackSnapshotCounter}`;
}

function createSnapshotKey(value: unknown): string {
	if (isPromiseLike(value)) {
		let key = deferredSnapshotKeys.get(value);
		if (!key) {
			key = generateSnapshotId('deferred');
			deferredSnapshotKeys.set(value, key);
		}
		return key;
	}

	return generateSnapshotId('resolved');
}

function createHydrationTarget<T>(items: HydrationItems<T>): OnboardingWorkspaceHydrationTarget<T> {
	return {
		mode: 'replace',
		deferred: isPromiseLike(items),
		snapshotKey: createSnapshotKey(items),
		items
	};
}

function createTemplatesHydrationTarget(data: OnboardingWorkspaceData): OnboardingTemplatesWorkspaceHydrationTarget {
	const templates = data.onboardingTemplates;
	const steps = data.onboardingTemplateSteps;

	return {
		mode: 'replace',
		snapshotKey: createSnapshotKey({ templates, steps }),
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

export async function streamOnboardingWorkspaceBootstrap(
	context: OnboardingWorkspaceRequestContext
): Promise<OnboardingWorkspaceRouteData> {
	const deferred = await loadWithContext(context.locals, context.cookies, context.orgId, {
		policyAction: POLICY_ACTION_CATALOG.onboarding.viewWorkflows,
		policyResource: { kind: 'unscoped' },
		defer: true,
		fn: async (ctx) => {
			const data = await fetchOnboardingBootstrap(ctx);
			return {
				laneKey: ONBOARDING_WORKSPACE_LANE_KEY,
				data,
				hydration: createOnboardingWorkspaceHydration(ctx.auth.orgId, data)
			} satisfies OnboardingWorkspaceResult;
		}
	});

	return {
		onboarding: deferred
	};
}
