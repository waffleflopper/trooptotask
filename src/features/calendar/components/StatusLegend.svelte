<script lang="ts">
	import type { StatusType } from '$lib/types';
	import { CalendarStatusBadge } from '$lib/components/ui/calendar-status-badge';

	interface Props {
		statusTypes: StatusType[];
	}

	let { statusTypes }: Props = $props();
</script>

{#if statusTypes.length > 0}
	<div class="flex shrink-0 flex-wrap items-center gap-1.5 px-1 py-0.5" aria-label="Status color legend">
		{#each statusTypes as status (status.id)}
			<CalendarStatusBadge statusType={status}>{status.name}</CalendarStatusBadge>
		{/each}
	</div>
{/if}
