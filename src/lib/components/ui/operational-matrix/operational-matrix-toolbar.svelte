<script lang="ts">
	import type { Snippet } from 'svelte';
	import * as WorkspaceToolbar from '$lib/components/ui/workspace-toolbar/index.js';

	interface Props {
		ariaLabel: string;
		children?: Snippet;
	}

	let { ariaLabel, children }: Props = $props();
</script>

<div class="operational-matrix-toolbar" data-slot="operational-matrix-toolbar">
	<WorkspaceToolbar.Root {ariaLabel}>
		{@render children?.()}
	</WorkspaceToolbar.Root>
</div>

<style>
	.operational-matrix-toolbar {
		padding: 0.5rem;
		border-bottom: 1px solid var(--matrix-rule);
		background: color-mix(in srgb, var(--card) 88%, var(--muted) 12%);
	}
</style>
