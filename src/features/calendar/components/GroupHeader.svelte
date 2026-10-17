<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import type { CalendarDateHeaderState } from '$features/calendar/utils/calendarRenderState';

	interface Props {
		groupName: string;
		isCollapsed?: boolean;
		isPinned?: boolean;
		onToggle?: () => void;
		onPinToggle?: () => void;
		outCounts?: readonly number[];
		days?: readonly Pick<CalendarDateHeaderState, 'dateKey' | 'dateLabel'>[];
	}

	let {
		groupName,
		isCollapsed = false,
		isPinned = false,
		onToggle,
		onPinToggle,
		outCounts,
		days = []
	}: Props = $props();
</script>

<div
	class="relative flex h-full w-full min-w-[calc(var(--calendar-personnel-column-width)+(var(--calendar-cell-width)*var(--dates-count)))] border-b border-border bg-muted text-foreground"
>
	<div
		class={[
			'sticky left-0 z-[4] flex min-w-[var(--calendar-personnel-column-width)] shrink-0 items-stretch border-r border-border bg-muted',
			outCounts
				? 'max-w-[var(--calendar-personnel-column-width)]'
				: 'max-w-[calc(var(--calendar-personnel-column-width)*2)]'
		]}
	>
		<Button
			variant="cell"
			size="none"
			class="h-full min-w-0 flex-1 justify-start gap-2 px-3 py-2 font-mono text-[11px] font-semibold tracking-widest text-foreground uppercase hover:bg-background hover:text-foreground"
			onclick={onToggle}
		>
			<span class="w-3 shrink-0 text-[10px]">{isCollapsed ? '▶' : '▼'}</span>
			<span class="truncate">{groupName}</span>
		</Button>
		<Button
			variant="cell"
			size="none"
			class="h-full min-w-14.5 border-l border-border px-2 font-mono text-[11px] font-medium tracking-widest text-muted-foreground uppercase hover:bg-background hover:text-foreground aria-pressed:bg-background aria-pressed:text-foreground"
			onclick={onPinToggle}
			aria-pressed={isPinned}
			title={isPinned ? 'Unpin group' : 'Pin group to top'}
		>
			{isPinned ? 'Pinned' : 'Pin'}
		</Button>
	</div>
	{#if outCounts}
		<div
			class="absolute inset-y-0 right-0 left-[var(--calendar-personnel-column-width)] grid grid-cols-[repeat(var(--dates-count),minmax(var(--calendar-cell-width),1fr))] items-center"
		>
			{#each days as day, index (day.dateKey)}
				{@const count = outCounts[index] ?? 0}
				<span class="text-center font-mono text-[10px] font-semibold text-foreground">
					{#if count > 0}
						<span aria-hidden="true">−{count}</span>
						<span class="sr-only">{day.dateLabel}: {count} out</span>
					{/if}
				</span>
			{/each}
		</div>
	{/if}
</div>
