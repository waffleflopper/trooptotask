<script lang="ts">
	import { Badge, type BadgeVariant } from '$lib/components/ui/badge';
	import { eventPhase, type CalendarEvent, type EventPhase } from '../eventModel';

	let { event, today }: { event: CalendarEvent; today: string } = $props();

	const PHASES: Record<EventPhase | 'cancelled', { label: string; variant: BadgeVariant }> = {
		upcoming: { label: 'Upcoming', variant: 'info' },
		ongoing: { label: 'Ongoing', variant: 'success' },
		past: { label: 'Past', variant: 'outline' },
		cancelled: { label: 'Cancelled', variant: 'danger' }
	};
	const phase = $derived(PHASES[event.cancellation ? 'cancelled' : eventPhase(event, today)]);
</script>

<Badge variant={phase.variant}>{phase.label}</Badge>
