<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { PersonnelPageContext } from '$features/personnel';
	import { personnelStubs } from './personnelStubs';

	let { children, loading }: { children: Snippet<[PersonnelPageContext]>; loading: Snippet } = $props();
</script>

{#if personnelStubs.ctx}
	{@render children(personnelStubs.ctx)}
{:else}
	{@render loading()}
{/if}
