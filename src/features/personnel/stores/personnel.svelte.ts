/**
 * Personnel write store — Personnel-owned mutation seam for roster administration.
 *
 * Cross-feature readers should import `rosterStore` from `$lib/stores/roster.svelte`.
 */
import { rosterWriteStore } from '$lib/stores/roster.svelte';

export const personnelStore = rosterWriteStore;
