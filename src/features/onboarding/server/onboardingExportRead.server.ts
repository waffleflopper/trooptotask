import type { OnboardingReadStore } from './onboardingPorts.server';

/** Raw saved rows for separately authorized exports; the request store retains its RLS. */
export function listPersonnelOnboardingExportRows(
	store: Pick<OnboardingReadStore, 'findMany'>,
	orgId: string
): Promise<Record<string, unknown>[]> {
	return store.findMany<Record<string, unknown>>('personnel_onboardings', orgId);
}

export function listOnboardingStepProgressExportRows(
	store: Pick<OnboardingReadStore, 'findMany'>,
	orgId: string
): Promise<Record<string, unknown>[]> {
	return store.findMany<Record<string, unknown>>('onboarding_step_progress', orgId);
}
