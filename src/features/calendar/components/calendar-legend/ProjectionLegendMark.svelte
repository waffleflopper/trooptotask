<script lang="ts" module>
	export type ProjectionLegendKind = 'commitment' | 'suspense' | 'conflict';
</script>

<script lang="ts">
	import TriangleAlert from '@lucide/svelte/icons/triangle-alert';

	let { value }: { value: ProjectionLegendKind } = $props();
</script>

{#if value === 'commitment'}
	<span aria-hidden="true" class="h-1 w-5 rounded-[2px] bg-accent"></span>
{:else if value === 'suspense'}
	<svg aria-hidden="true" width="9" height="9" viewBox="0 0 10 10" class="shrink-0">
		<path d="M5 .8L9.2 5 5 9.2.8 5z" stroke-width="1.2" class="fill-card stroke-foreground" />
	</svg>
{:else}
	<span aria-hidden="true" class="relative flex h-3 w-5 items-center">
		<span class="h-1 w-full bg-[repeating-linear-gradient(90deg,var(--color-accent)_0_5px,transparent_5px_8px)]"></span>
		<span
			class="absolute left-0 flex size-3 items-center justify-center rounded-full bg-card text-accent-text ring-1 ring-accent"
		>
			<TriangleAlert class="size-2" strokeWidth={2.5} />
		</span>
	</span>
{/if}
