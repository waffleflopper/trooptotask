import { createContext } from 'svelte';

export interface AppDialogState {
	readonly busy: boolean;
	readonly closeBlocked: boolean;
}

export const [getAppDialogState, setAppDialogState] = createContext<AppDialogState>();
