import type { OnboardingStartOptions, StartOnboardingBatchResult } from './contracts';
import { buildRequestError } from '$lib/stores/core';

export interface OnboardingStartRequest {
	personnelIds: string[];
	startedAt: string;
	templateId: string;
}

/** Starts the template for every person in one request. Each person's outcome is in `results`. */
export async function startOnboardingPackets(
	orgId: string,
	start: OnboardingStartRequest
): Promise<StartOnboardingBatchResult> {
	const response = await fetch(`/org/${orgId}/api/onboarding`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(start)
	});
	if (!response.ok) throw await buildRequestError(response, 'POST', 'onboarding');
	return response.json();
}

export async function loadOnboardingStartOptions(orgId: string): Promise<OnboardingStartOptions> {
	const response = await fetch(`/org/${orgId}/api/onboarding/start-options`, { cache: 'no-store' });
	if (!response.ok) throw await buildRequestError(response, 'GET', 'onboarding start options');
	return response.json();
}
