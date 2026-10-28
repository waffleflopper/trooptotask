import { createContext, type Component } from 'svelte';
import type { ClientAccess } from '$lib/access/clientAccess';
import type { SetupBranch } from './branch';

export interface SetupTrainingSuggestion {
	id: string;
	name: string;
	expirationMonths: number;
}

export interface SetupTrainingType {
	id: string;
	name: string;
	expirationMonths: number | null;
}

export interface SetupTrainingTypeCatalog {
	readonly trainingTypes: readonly SetupTrainingType[];
}

/** Training's type editor and the loader for the catalog it edits. */
export interface SetupTrainingTypeEditor<Catalog extends SetupTrainingTypeCatalog = SetupTrainingTypeCatalog> {
	load(): Promise<Catalog>;
	Editor: Component<{
		catalog: Catalog;
		/** The type to edit, or null for a new one. */
		typeId: string | null;
		onChanged(): void;
		onClose(): void;
	}>;
}

/**
 * Pairs a loader with its editor. The step hands the editor only a catalog this loader produced, at most with its
 * types replaced by rows from the same server, so the editor may read the fields setup does not know about.
 */
export function setupTrainingTypeEditor<Catalog extends SetupTrainingTypeCatalog>(
	editor: SetupTrainingTypeEditor<Catalog>
): SetupTrainingTypeEditor {
	return editor as unknown as SetupTrainingTypeEditor;
}

/**
 * What feature step bodies need from features Organization may not import. The setup route supplies it, so Training
 * keeps owning its suggestion list and type editor, and the app shell keeps owning the viewer's access.
 */
export interface SetupStepSupport {
	access: ClientAccess;
	trainingSuggestions(branch: SetupBranch | null): readonly SetupTrainingSuggestion[];
	trainingTypes: SetupTrainingTypeEditor;
}

export const [getSetupStepSupport, setSetupStepSupport] = createContext<SetupStepSupport>();

type FailedItem = { name: string; message: string };

/** Importing Calendar's row types here would create a feature dependency cycle. */
export interface SetupCalendarSuggestionsResult {
	created: { id: string; name: string }[];
	skipped: { id: string; name: string }[];
	failed: FailedItem[];
	statusTypes: unknown[];
	assignmentTypes: unknown[];
}

/** The parts of Training's suggestions result that setup reads. */
export interface SetupTrainingSuggestionsResult {
	failed: FailedItem[];
	trainingTypes: SetupTrainingType[];
}

/** The part of the starter pack result that setup reads. */
export interface SetupStarterPackResult {
	failed: FailedItem[];
}
