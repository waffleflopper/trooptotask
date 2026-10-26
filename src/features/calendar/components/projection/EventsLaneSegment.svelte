<script lang="ts" module>
	import type { ProjectionCardChoice, ProjectionTarget } from '$features/calendar/projection/projectionCards';

	export interface EventsLaneSegment {
		readonly title: string;
		readonly href: string;
		readonly target: ProjectionTarget;
		/** Names the control: the title with its dates and host, and that it is cancelled. */
		readonly label: string;
		readonly cancelled: boolean;
		/** We run it; otherwise another Organization does and we track it. */
		readonly hosted: boolean;
		/** Taskings on the Event that the reader can see. */
		readonly taskings: number;
		/** 0 is the top row of the lane. */
		readonly row: number;
		readonly continuesBefore: boolean;
		readonly continuesAfter: boolean;
		readonly days: number;
		/** Free columns after the segment that a tracked Event's title may use before the next one or the range edge. */
		readonly room: number;
		readonly self: ProjectionCardChoice;
		/** Events on these days that fit no row. */
		readonly others: readonly ProjectionCardChoice[];
	}
</script>

<script lang="ts">
	import ProjectionMarker from './ProjectionMarker.svelte';

	let { value }: { value: EventsLaneSegment } = $props();

	const focus = 'focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none';
	const everyone = $derived([value.self, ...value.others]);
	const label = $derived(
		value.taskings > 0 ? `${value.label}, ${value.taskings} Tasking${value.taskings === 1 ? '' : 's'}` : value.label
	);
	// A hosted bar keeps its title inside the dark fill; a tracked chip's title may run on past a short chip.
	const titleWidth = $derived(
		value.hosted ? undefined : `calc(${((value.days + value.room) / value.days) * 100}% - 0.25rem)`
	);
</script>

<div
	class={[
		'absolute inset-x-px flex h-[17px] min-w-0 items-center gap-px font-body text-[11px] leading-[14px]',
		value.row === 0 ? 'top-[5px]' : 'top-[calc(50%+2px)]'
	]}
>
	<ProjectionMarker
		target={value.target}
		href={value.href}
		{label}
		title={label}
		class={[
			'relative flex h-full min-w-0 flex-1 items-center gap-1.5 px-1.5 no-underline',
			value.hosted
				? 'overflow-hidden bg-chrome text-chrome-text'
				: 'border border-dashed border-muted-foreground/60 text-muted-foreground',
			!value.continuesBefore && 'rounded-l-[3px]',
			!value.continuesAfter && 'rounded-r-[3px]',
			value.continuesBefore && 'border-l-0',
			value.continuesAfter && 'border-r-0',
			focus
		].join(' ')}
	>
		<span
			aria-hidden="true"
			class={[
				'block shrink-0 overflow-hidden text-ellipsis whitespace-nowrap',
				value.hosted ? 'max-w-full font-semibold' : 'font-normal',
				value.cancelled && 'line-through opacity-70'
			]}
			style:max-width={titleWidth}>{value.title}</span
		>
		{#if value.hosted && value.taskings > 0}
			<span aria-hidden="true" class="shrink-0 font-mono text-[9px] leading-3 text-chrome-accent">{value.taskings}</span
			>
		{/if}
	</ProjectionMarker>
	{#if value.others.length > 0}
		<ProjectionMarker
			label={`${value.others.length} more Events: ${value.others.map((item) => item.title).join(', ')}`}
			heading={`${everyone.length} Events`}
			choices={everyone}
			class={`flex h-full shrink-0 items-center rounded-[3px] border border-dashed border-muted-foreground/60 bg-card px-1 font-mono text-[9px] leading-none font-semibold text-foreground ${focus}`}
		>
			+{value.others.length}
		</ProjectionMarker>
	{/if}
</div>
