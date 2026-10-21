import { createContext } from 'svelte';

export interface AppDialogState {
	readonly busy: boolean;
	readonly closeBlocked: boolean;
	readonly tone: AppDialogTone;
}

export type AppDialogTone = 'default' | 'destructive';

export const [getAppDialogState, setAppDialogState] = createContext<AppDialogState>();
