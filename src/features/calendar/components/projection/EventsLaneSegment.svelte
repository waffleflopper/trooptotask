<script lang="ts" module>
	import type { MarkerListItem } from './MarkerListPopover.svelte';

	export interface EventsLaneSegment {
		readonly title: string;
		readonly href: string;
		/** Names the link: the title with its dates, and that it is cancelled. */
		readonly label: string;
		readonly cancelled: boolean;
		readonly continuesBefore: boolean;
		readonly continuesAfter: boolean;
		readonly days: number;
		/** Free columns after the segment that the title may use before the next segment or the range edge. */
		readonly room: number;
		readonly self: MarkerListItem;
		/** Other Events on these days, behind this one. */
		readonly others: readonly MarkerListItem[];
	}
</script>

<script lang="ts">
	import MarkerListPopover from './MarkerListPopover.svelte';

	let { value }: { value: EventsLaneSegment } = $props();

	const focus = 'focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none';
	const everyone = $derived([value.self, ...value.others]);
	const titles = $derived(everyone.map((item) => item.title).join(', '));
</script>

<div class="relative flex h-full min-w-0 items-center text-[11px] leading-none text-foreground">
	<span
		aria-hidden="true"
		class={[
			'pointer-events-none absolute inset-x-px inset-y-1 border-info bg-info-muted',
			!value.continuesBefore && 'rounded-l-sm border-l-2',
			!value.continuesAfter && 'rounded-r-sm'
		]}
	></span>
	{#if value.others.length > 0 && value.days === 1}
		<MarkerListPopover
			label={`${everyone.length} Events: ${titles}`}
			heading={`${everyone.length} Events`}
			items={everyone}
			class={`relative z-[1] flex size-full items-center justify-center font-mono text-[9px] font-semibold ${focus}`}
		>
			{everyone.length}
		</MarkerListPopover>
	{:else}
		<a
			href={value.href}
			class={`relative z-[1] flex h-full min-w-0 items-center text-foreground no-underline ${value.others.length > 0 ? 'flex-1' : 'w-full'} ${focus}`}
			aria-label={value.label}
			title={value.label}
		>
			<span
				aria-hidden="true"
				class={[
					'block shrink-0 overflow-hidden px-1.5 font-medium text-ellipsis whitespace-nowrap',
					value.cancelled && 'text-muted-foreground line-through'
				]}
				style:max-width={`calc(${((value.days + value.room) / value.days) * 100}% - 0.25rem)`}>{value.title}</span
			>
		</a>
		{#if value.others.length > 0}
			<MarkerListPopover
				label={`${value.others.length} more Events: ${value.others.map((item) => item.title).join(', ')}`}
				heading={`${everyone.length} Events`}
				items={everyone}
				class={`relative z-[1] mx-px flex h-4 shrink-0 items-center rounded-sm border border-dashed border-info bg-card px-0.5 font-mono text-[9px] leading-none font-semibold ${focus}`}
			>
				+{value.others.length}
			</MarkerListPopover>
		{/if}
	{/if}
</div>
