<script lang="ts">
	import type { Snippet } from 'svelte';
	import { setComboboxCommandContext } from './context.js';

	let { props, children }: { props: Record<string, unknown>; children?: Snippet } = $props();

	setComboboxCommandContext({
		get props() {
			return props;
		},
		handleKeydown(event) {
			if (typeof props.onkeydown === 'function') props.onkeydown(event);
		}
	});
</script>

{@render children?.()}
