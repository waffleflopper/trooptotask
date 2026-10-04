<script lang="ts">
	import { onDestroy, untrack, type Snippet } from 'svelte';
	import { toast } from 'svelte-sonner';
	import type { UserOrgPreferences } from './accountPreferences';
	import { AccountPreferencesState } from './accountPreferences.svelte';
	import { setAccountPreferencesContext } from './accountPreferencesContext';

	let {
		userId,
		orgId,
		preferences,
		children
	}: {
		userId: string;
		orgId: string;
		preferences: UserOrgPreferences;
		children: Snippet;
	} = $props();

	// The layout keys this owner by user/Organization. Revalidated shell data is
	// an initial seed only: an older load must not replace newer local choices.
	const state = untrack(
		() =>
			new AccountPreferencesState({ userId, orgId, preferences }, (message) => toast.error(message, { duration: 6000 }))
	);
	setAccountPreferencesContext(state);
	onDestroy(() => state.dispose());
</script>

{@render children()}
