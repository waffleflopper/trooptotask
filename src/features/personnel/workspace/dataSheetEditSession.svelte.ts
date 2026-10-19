import { getContext, setContext } from 'svelte';
import type { DataSheetDraft } from './dataSheetDraft.svelte';

interface DataSheetEditHandlers {
	save: () => void;
	cancel: () => void;
}

/**
 * The header owns the edit actions and the Data sheet page owns the draft. The page attaches its draft
 * here while edit mode is open so the header can show the count and drive Save and Cancel.
 */
export class DataSheetEditSession {
	#attached = $state.raw<{ draft: DataSheetDraft; handlers: DataSheetEditHandlers } | null>(null);

	get changeCount(): number {
		return this.#attached?.draft.changeCount ?? 0;
	}

	get saving(): boolean {
		return this.#attached?.draft.saving ?? false;
	}

	get ready(): boolean {
		return this.#attached !== null;
	}

	save = (): void => this.#attached?.handlers.save();

	cancel = (): void => this.#attached?.handlers.cancel();

	attach = (draft: DataSheetDraft, handlers: DataSheetEditHandlers): (() => void) => {
		const attached = { draft, handlers };
		this.#attached = attached;
		return () => {
			if (this.#attached === attached) this.#attached = null;
		};
	};
}

const CONTEXT_KEY = Symbol('data-sheet-edit-session');

export function provideDataSheetEditSession(): DataSheetEditSession {
	const session = new DataSheetEditSession();
	setContext(CONTEXT_KEY, session);
	return session;
}

export function getDataSheetEditSession(): DataSheetEditSession {
	const session = getContext<DataSheetEditSession | undefined>(CONTEXT_KEY);
	if (!session) throw new Error('The Data sheet edit session is provided by the personnel detail layout.');
	return session;
}
