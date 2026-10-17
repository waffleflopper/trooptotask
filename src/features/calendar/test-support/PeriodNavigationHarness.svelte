<script lang="ts">
	import CalendarPeriodNavigation from '../components/CalendarPeriodNavigation.svelte';
	import type { CalendarViewMode } from '../utils/calendarRange';

	interface Props {
		view: CalendarViewMode;
		anchor: Date;
		disabled?: boolean;
		onAnchorChange: (anchor: Date) => void;
	}

	let { view, anchor, disabled, onAnchorChange }: Props = $props();
</script>

<CalendarPeriodNavigation {view} {anchor} {disabled} {onAnchorChange}>
	{#snippet layout({ monthPicker, previous, next, today })}
		{@render today()}
		{@render previous()}
		{@render monthPicker()}
		{@render next()}
	{/snippet}
</CalendarPeriodNavigation>
