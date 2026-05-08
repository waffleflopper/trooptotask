<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		children?: Snippet;
		group?: boolean;
		disabled?: boolean;
	}

	let { children, group = false, disabled = false }: Props = $props();
</script>

<tr
	class="operational-matrix-row"
	data-slot="operational-matrix-row"
	data-group={group ? 'true' : undefined}
	data-disabled={disabled ? 'true' : undefined}
>
	{@render children?.()}
</tr>

<style>
	.operational-matrix-row:hover {
		background: color-mix(in srgb, var(--muted) 56%, transparent);
	}

	.operational-matrix-row[data-disabled='true'] {
		color: var(--muted-foreground);
	}
</style>
