import { createContext } from 'svelte';

export interface AppDialogState {
	readonly busy: boolean;
	readonly closeBlocked: boolean;
	readonly tone: AppDialogTone;
	readonly voice: AppDialogVoice;
}

export type AppDialogTone = 'default' | 'destructive';

/** `editorial` sets the dialog in the platform admin's type: condensed title, serif body and its roomier spacing. */
export type AppDialogVoice = 'default' | 'editorial';

export const [getAppDialogState, setAppDialogState] = createContext<AppDialogState>();
