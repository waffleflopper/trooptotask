import { invalidate } from '$app/navigation';
import type { UserOrgPreferences, UserOrgPreferencesPatch } from './userPreferences';

let patchQueue: Promise<void> = Promise.resolve();

async function sendPatch(orgId: string, patch: UserOrgPreferencesPatch): Promise<UserOrgPreferences> {
	const res = await fetch(`/org/${orgId}/api/user-preferences`, {
		method: 'PATCH',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(patch)
	});

	if (!res.ok) {
		let message = 'Failed to save your preferences';
		try {
			const body = (await res.json()) as { message?: string };
			message = body.message ?? message;
		} catch {
			// Leave the fallback message in place.
		}
		throw new Error(message);
	}

	const preferences = (await res.json()) as UserOrgPreferences;
	await invalidate('app:org-core');
	return preferences;
}

export function queueUserPreferencesPatch(orgId: string, patch: UserOrgPreferencesPatch): Promise<UserOrgPreferences> {
	const request = patchQueue.catch(() => undefined).then(() => sendPatch(orgId, patch));
	patchQueue = request.then(
		() => undefined,
		() => undefined
	);
	return request;
}
