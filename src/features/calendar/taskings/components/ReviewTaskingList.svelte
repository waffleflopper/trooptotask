<script lang="ts">
	import type { CalendarEventsPageAccess } from '../../contracts';
	import { formatDayMonthYear } from '$lib/utils/dates';
	import { executionLabel, responsibilityLabel } from './taskingLabels';
	import type { GroupLabels, Tasking } from '../taskingModel';

	interface Props {
		org: CalendarEventsPageAccess;
		items: { tasking: Tasking; note?: string }[];
		groupLabels: GroupLabels;
		/** Opens the Tasking's own edit, so dates are changed there and never here. */
		edit?: boolean;
	}

	let { org, items, groupLabels, edit = false }: Props = $props();
</script>

<ul class="grid gap-2">
	{#each items as { tasking, note } (tasking.id)}
		{@const execution = executionLabel(tasking.execution)}
		<li>
			<a
				href={`/org/${org.orgUrlSegment}/calendar/taskings/${tasking.id}${edit ? '?edit' : ''}`}
				class="grid gap-0.5 rounded-lg border p-3 transition-colors hover:bg-muted/60 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
			>
				<span class="truncate font-medium text-foreground">{tasking.title}</span>
				<span class="text-sm text-muted-foreground">
					{responsibilityLabel(tasking.responsibility, groupLabels, org.orgName)} · Due
					{formatDayMonthYear(tasking.suspenseOn)}{execution ? ` · Executes ${execution}` : ''}
				</span>
				{#if note}<span class="text-sm text-foreground">{note}</span>{/if}
			</a>
		</li>
	{/each}
</ul>
