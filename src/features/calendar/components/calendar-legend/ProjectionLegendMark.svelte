<script lang="ts" module>
	export type ProjectionLegendKind = 'event' | 'suspense' | 'commitment';
</script>

<script lang="ts">
	let { value }: { value: ProjectionLegendKind } = $props();
</script>

{#if value === 'event'}
	<span aria-hidden="true" class="h-3 w-5 rounded-sm border-l-2 border-info bg-info-muted"></span>
{:else if value === 'suspense'}
	<span aria-hidden="true" class="flex h-3 w-5 items-center justify-center"
		><span class="size-2 rotate-45 bg-info"></span></span
	>
{:else}
	<span
		aria-hidden="true"
		class="h-1.5 w-5 rounded-full border border-info bg-[repeating-linear-gradient(135deg,var(--color-info)_0_2px,transparent_2px_5px)]"
	></span>
{/if}
