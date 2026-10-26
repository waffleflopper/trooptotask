import { createContext } from 'svelte';

export interface AppDialogState {
	readonly busy: boolean;
	readonly closeBlocked: boolean;
	readonly tone: AppDialogTone;
	readonly voice: AppDialogVoice;
}

export type AppDialogTone = 'default' | 'destructive';

/**
 * `editorial` sets the dialog in the platform admin's type: condensed title, serif body and its roomier spacing.
 * `form` frames a create or edit form: a ruled header with a condensed title and a muted footer bar.
 */
export type AppDialogVoice = 'default' | 'editorial' | 'form';

export const [getAppDialogState, setAppDialogState] = createContext<AppDialogState>();
