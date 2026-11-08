import type { SetupBranch } from '$features/organization/contracts';
import type { TrainingSuggestionsInput } from './trainingSuggestions';
import type { TrainingSuggestionsResult } from './contracts';

async function readJson<T>(response: Response, fallback: string): Promise<T> {
	const payload: unknown = await response.json().catch(() => null);
	if (!response.ok) {
		const message = (payload as { message?: unknown } | null)?.message;
		throw new Error(typeof message === 'string' ? message : fallback);
	}
	return payload as T;
}

/** The Organization's setup branch, which picks the starter list. */
export async function fetchTrainingSuggestionBranch(orgId: string): Promise<SetupBranch | null> {
	const response = await fetch(`/org/${orgId}/api/training-types/suggestions`);
	return (await readJson<{ branch: SetupBranch | null }>(response, 'Could not check for starter training types.'))
		.branch;
}

export async function postTrainingSuggestions(
	orgId: string,
	input: TrainingSuggestionsInput
): Promise<TrainingSuggestionsResult> {
	const response = await fetch(`/org/${orgId}/api/training-types/suggestions`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(input)
	});
	return readJson<TrainingSuggestionsResult>(response, 'Could not add the training types. Try again.');
}
