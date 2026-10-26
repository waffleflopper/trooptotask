<script lang="ts">
	import * as PageShell from '$lib/components/patterns/page-shell';

	let { orgUrlSegment, current }: { orgUrlSegment: string; current: 'events' | 'taskings' } = $props();

	const items = $derived([
		{ label: 'Events', href: `/org/${orgUrlSegment}/calendar/events` as const, active: current === 'events' },
		{ label: 'Taskings', href: `/org/${orgUrlSegment}/calendar/taskings` as const, active: current === 'taskings' }
	]);
</script>

<PageShell.Tabs label="Events and taskings" {items} />
