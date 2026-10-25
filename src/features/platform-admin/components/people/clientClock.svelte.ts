import { onMount } from 'svelte';
import { SvelteDate } from 'svelte/reactivity';

/** The operator's own clock. It is null on the server and until hydration, so local times never differ between the two. */
export function createClientClock() {
	let now = $state<SvelteDate | null>(null);
	onMount(() => {
		now = new SvelteDate();
	});
	return {
		get now() {
			return now;
		}
	};
}
