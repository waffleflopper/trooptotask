import type { SetupPromptChoice } from './entry';
import type { SetupModel } from './model';
import { parseOrganizationSetup, type OrganizationSetup, type SetupPromptKey } from './state';

async function readSetupResponse(response: Response): Promise<unknown> {
	const payload: unknown = await response.json().catch(() => null);
	if (!response.ok) {
		const message = (payload as { message?: unknown } | null)?.message;
		throw new Error(typeof message === 'string' ? message : 'Try again.');
	}
	return payload;
}

export async function postSetup(
	orgUrlSegment: string,
	path: 'answer' | 'finish' | 'prompt',
	body: Record<string, unknown>
): Promise<OrganizationSetup> {
	const response = await fetch(`/org/${orgUrlSegment}/api/organization/setup/${path}`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(body)
	});
	return parseOrganizationSetup(await readSetupResponse(response));
}

export function postSetupPromptChoice(orgUrlSegment: string, key: SetupPromptKey, choice: SetupPromptChoice) {
	return postSetup(orgUrlSegment, 'prompt', { key, choice });
}

export async function fetchSetupProgress(orgUrlSegment: string): Promise<SetupModel> {
	const response = await fetch(`/org/${orgUrlSegment}/api/organization/setup/progress`, { cache: 'no-store' });
	return (await readSetupResponse(response)) as SetupModel;
}

export function setupErrorMessage(cause: unknown) {
	return cause instanceof Error && cause.message ? cause.message : 'Try again.';
}
