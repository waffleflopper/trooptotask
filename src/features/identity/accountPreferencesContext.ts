import { createContext } from 'svelte';
import type { AccountPreferencesState } from './accountPreferences.svelte';

export const [getAccountPreferencesContext, setAccountPreferencesContext] = createContext<AccountPreferencesState>();
