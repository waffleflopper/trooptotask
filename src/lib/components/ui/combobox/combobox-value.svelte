<script lang="ts">
	import type { Snippet } from 'svelte';
	import { getComboboxContext } from './context.js';

	interface Props {
		children?: Snippet<[string[]]>;
	}

	let { children }: Props = $props();
	const context = getComboboxContext();
</script>

{@render children?.(context.getSelectedValues())}
