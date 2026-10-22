import type { OnboardingStartOptions, PersonnelOnboarding } from './contracts';
import { buildRequestError } from '$lib/stores/core';

export interface OnboardingStartRequest {
	personnelId: string;
	startedAt: string;
	templateId: string | null;
}

export async function startOnboardingPacket(
	orgId: string,
	start: OnboardingStartRequest
): Promise<PersonnelOnboarding> {
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
