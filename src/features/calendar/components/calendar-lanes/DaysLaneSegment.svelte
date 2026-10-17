<script lang="ts" module>
	import type { SpecialDay } from '$features/calendar/contracts';

	export interface DaysLaneSegment {
		readonly name: string;
		readonly type: SpecialDay['type'];
		readonly label: string;
		readonly days: number;
		/** Free columns after the segment that its name may use before the next segment or the range edge. */
		readonly room: number;
	}
</script>

<script lang="ts">
	let { value }: { value: DaysLaneSegment } = $props();
</script>

<span
	class={[
		'flex h-full items-center gap-1 px-1 text-[11px] leading-none whitespace-nowrap italic',
		value.type === 'federal-holiday' ? 'text-warning-foreground' : 'text-foreground'
	]}
	title={value.label}
>
	<span
		class={['size-1.5 shrink-0 rounded-full', value.type === 'federal-holiday' ? 'bg-warning' : 'bg-muted-foreground']}
		aria-hidden="true"
	></span>
	<span
		class="block shrink-0 overflow-hidden text-ellipsis"
		style:max-width={`calc(${((value.days + value.room) / value.days) * 100}% - 0.75rem)`}
		aria-hidden="true">{value.name}</span
	>
	<span class="sr-only">{value.label}</span>
</span>
