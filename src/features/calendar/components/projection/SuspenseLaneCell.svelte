<script lang="ts" module>
	import type { MarkerListItem } from './MarkerListPopover.svelte';

	export interface SuspenseLaneDay {
		readonly dateLabel: string;
		/** Every suspense due this day, in the order the first one is shown. */
		readonly markers: readonly (MarkerListItem & { readonly label: string })[];
		/** Ten pixel columns have room for one control, which opens the list. */
		readonly compact: boolean;
	}
</script>

<script lang="ts">
	import MarkerListPopover from './MarkerListPopover.svelte';

	let { value }: { value: SuspenseLaneDay } = $props();

	const first = $derived(value.markers[0]);
	const more = $derived(value.markers.slice(1));
	const listLabel = $derived(
		`${value.markers.length} suspense${value.markers.length === 1 ? '' : 's'} due ${value.dateLabel}`
	);
</script>

{#snippet diamond()}
	<span aria-hidden="true" class="size-2 shrink-0 rotate-45 bg-info"></span>
{/snippet}

{#if first}
	{#if value.compact && more.length > 0}
		<MarkerListPopover
			label={listLabel}
			heading={`Suspenses due ${value.dateLabel}`}
			items={value.markers}
			class="flex size-full items-center justify-center focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
		>
			{@render diamond()}
		</MarkerListPopover>
	{:else}
		<div class="flex size-full min-w-0 items-center justify-center">
			<a
				href={first.href}
				class="flex h-full min-w-0 flex-1 items-center justify-center focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
				aria-label={first.label}
				title={first.label}
			>
				{@render diamond()}
			</a>
			{#if more.length > 0}
				<MarkerListPopover
					label={`${more.length} more: ${listLabel}`}
					heading={`Suspenses due ${value.dateLabel}`}
					items={value.markers}
					class="mr-px flex h-4 shrink-0 items-center rounded-sm border border-dashed border-info px-0.5 font-mono text-[9px] leading-none font-semibold text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
				>
					+{more.length}
				</MarkerListPopover>
			{/if}
		</div>
	{/if}
{/if}
