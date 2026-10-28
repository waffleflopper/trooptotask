<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { getCalendarTypeSetup, type CalendarTypeKind } from './calendarTypeSetup';

	let { kind }: { kind: CalendarTypeKind } = $props();

	const setup = getCalendarTypeSetup();
	const noun = $derived(kind === 'status' ? 'status types' : 'assignment types');
	const current = $derived(setup?.());
</script>

<span>
	No {noun} yet.
	{#if current?.canSetUp[kind]}
		<Button
			variant="link"
			size="none"
			class="align-baseline underline"
			href={`/org/${current.orgUrlSegment}/calendar/settings?section=${kind}`}
		>
			Set up {noun}
		</Button>
	{:else}
		Ask someone who manages Calendar settings to add one.
	{/if}
</span>
