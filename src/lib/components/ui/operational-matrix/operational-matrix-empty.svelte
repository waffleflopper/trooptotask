<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		title: string;
		description?: string;
		colspan: number;
		children?: Snippet;
	}

	let { title, description, colspan, children }: Props = $props();
</script>

<tr data-slot="operational-matrix-empty">
	<td class="operational-matrix-empty" {colspan}>
		<strong>{title}</strong>
		{#if description}
			<span>{description}</span>
		{/if}
		{@render children?.()}
	</td>
</tr>

<style>
	.operational-matrix-empty {
		padding: 2rem;
		color: var(--muted-foreground);
		text-align: center;
	}

	.operational-matrix-empty strong {
		display: block;
		color: var(--foreground);
		font-weight: 700;
	}

	.operational-matrix-empty span {
		display: block;
		margin-top: 0.25rem;
	}
</style>
