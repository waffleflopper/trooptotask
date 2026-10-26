<script lang="ts">
	import type { CalendarDateHeaderState } from '$features/calendar/utils/calendarRenderState';
	import type { CalendarLane } from '$features/calendar/utils/calendarLanes';

	interface Props {
		lanes: readonly CalendarLane[];
		headerCells: readonly CalendarDateHeaderState[];
	}

	let { lanes, headerCells }: Props = $props();

	const uid = $props.id();
</script>

<div class="[--calendar-lane-height:26px] max-[641px]:[--calendar-lane-height:24px]">
	{#each lanes as lane, laneIndex (lane.key)}
		{@const labelId = `${uid}-lane-${laneIndex}-label`}
		{@const summaryId = `${uid}-lane-${laneIndex}-summary`}
		<div
			role="group"
			aria-labelledby={labelId}
			aria-describedby={summaryId}
			data-lane-kind={lane.kind}
			class="relative grid h-(--calendar-lane-height) w-full min-w-[calc(var(--calendar-personnel-column-width)+(var(--calendar-cell-width)*var(--dates-count)))] grid-cols-[var(--calendar-personnel-column-width)_repeat(var(--dates-count),minmax(var(--calendar-cell-width),1fr))]"
		>
			<div
				class="sticky left-0 z-[3] flex min-w-0 items-center gap-2 border-r border-b bg-card px-3 font-mono text-[10px] font-semibold tracking-widest text-muted-foreground uppercase sm:px-4"
			>
				{#if lane.color}
					<span class="size-2 shrink-0 rounded-[2px]" style:background-color={lane.color} aria-hidden="true"></span>
				{/if}
				<span id={labelId} class="min-w-0 truncate text-foreground">{lane.label}</span>
				{#if lane.detail}
					<span class="ml-auto shrink-0 tracking-normal normal-case">{lane.detail}</span>
				{/if}
				<span id={summaryId} class="sr-only">{lane.summary}</span>
			</div>
			{#each headerCells as header, index (header.dateKey)}
				<div
					class={[
						'min-w-0 border-r border-b bg-card',
						header.weekend && 'bg-muted/55',
						header.holiday && 'bg-warning-muted/60',
						header.today && 'bg-primary/10'
					]}
				>
					{#if lane.track.shape === 'day'}
						<lane.track.Day value={lane.track.days[index]} />
					{/if}
				</div>
			{/each}
			{#if lane.track.shape === 'span'}
				{#each lane.track.segments as segment, segmentIndex (segmentIndex)}
					<!-- Positioned grid items take their column without displacing the auto-placed day cells. -->
					<div
						class="absolute inset-0 z-[1] min-w-0"
						style:grid-row="1"
						style:grid-column={`${segment.start + 2} / ${segment.end + 3}`}
					>
						<lane.track.Segment value={segment.value} />
					</div>
				{/each}
			{/if}
			{#if lane.track.shape === 'status'}
				<div class="absolute inset-y-0 right-0 left-(--calendar-personnel-column-width) z-[1] min-w-0">
					<!-- Sticky, so the message stays in view while the dates scroll. -->
					<div class="sticky left-(--calendar-personnel-column-width) flex h-full w-max max-w-full items-center">
						<lane.track.Status value={lane.track.value} />
					</div>
				</div>
			{/if}
		</div>
	{/each}
</div>
