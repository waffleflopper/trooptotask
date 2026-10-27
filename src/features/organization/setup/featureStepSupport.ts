import { createContext } from 'svelte';
import type { ClientAccess } from '$lib/access/clientAccess';
import type { SetupBranch } from './branch';

export interface SetupTrainingSuggestion {
	id: string;
	name: string;
	expirationMonths: number;
}

/**
 * What feature step bodies need from features Organization may not import. The setup route supplies it, so Training
 * keeps owning its suggestion list and the app shell keeps owning the viewer's access.
 */
export interface SetupStepSupport {
	access: ClientAccess;
	trainingSuggestions(branch: SetupBranch | null): readonly SetupTrainingSuggestion[];
}

export const [getSetupStepSupport, setSetupStepSupport] = createContext<SetupStepSupport>();

type FailedItem = { name: string; message: string };

/** The parts of Training's suggestions result that setup reads. */
export interface SetupTrainingSuggestionsResult {
	failed: FailedItem[];
	trainingTypes: { name: string }[];
}

/** The part of the starter pack result that setup reads. */
export interface SetupStarterPackResult {
	failed: FailedItem[];
}
