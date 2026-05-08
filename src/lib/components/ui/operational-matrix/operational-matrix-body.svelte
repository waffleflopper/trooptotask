<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		children?: Snippet;
	}

	let { children }: Props = $props();
</script>

<tbody data-slot="operational-matrix-body">
	{@render children?.()}
</tbody>
