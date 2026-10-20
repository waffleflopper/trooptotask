<script lang="ts">
	import type { CalendarRangeCoordinator } from '$features/calendar/contexts/CalendarRangeCoordinator.svelte';

	let { orgId, rangeCoordinator }: { orgId: string; rangeCoordinator: CalendarRangeCoordinator } = $props();

	const COVERED = { availability: { rangeStart: '2026-01-10', rangeEnd: '2026-01-12' } };
	const FAR = { availability: { rangeStart: '2026-06-01', rangeEnd: '2026-06-03' } };
</script>

<button type="button" onclick={() => rangeCoordinator.ensureRange(orgId, COVERED)}>Read covered dates</button>
<button type="button" onclick={() => rangeCoordinator.ensureRange(orgId, FAR)}>Read far dates</button>
<p role="status">
	covered {rangeCoordinator.status(COVERED)}, far {rangeCoordinator.status(FAR)}
</p>
