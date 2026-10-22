<script lang="ts">
	import TriangleAlertIcon from '@lucide/svelte/icons/triangle-alert';
	import type { PlannerConflict } from '$features/calendar/utils/assignmentPlanner';
	import { Button } from '$lib/components/ui/button';

	interface Props {
		conflicts: readonly PlannerConflict[];
		busy: boolean;
		onFindReplacement: (typeId: string, dateKey: string, anchor: HTMLElement) => void;
	}

	let { conflicts, busy, onFindReplacement }: Props = $props();
</script>

<section class="rounded-lg border bg-card" aria-labelledby="planner-conflicts-title">
	<header class="flex items-center justify-between gap-2 border-b px-4 py-3">
		<h2
			id="planner-conflicts-title"
			class={[
				'font-mono text-xs font-semibold tracking-widest uppercase',
				conflicts.length > 0 ? 'text-destructive-text' : 'text-muted-foreground'
			]}
		>
			Conflicts
		</h2>
		<span class="font-mono text-xs font-semibold text-destructive-text" aria-label={`${conflicts.length} conflicts`}
			>{conflicts.length}</span
		>
	</header>
	{#if conflicts.length === 0}
		<p class="px-4 py-3 text-sm text-muted-foreground">No one is assigned on a day they are unavailable.</p>
	{:else}
		<ul class="divide-y">
			{#each conflicts as conflict (`${conflict.dateKey}::${conflict.typeId}`)}
				<li class="grid gap-2 px-4 py-3">
					<p class="flex items-center gap-2 font-mono text-[10px] font-semibold tracking-widest uppercase">
						<TriangleAlertIcon class="size-3.5 text-destructive-text" aria-hidden="true" />
						<span>{conflict.dateLabel}</span>
						<span class="text-muted-foreground">{conflict.typeName}</span>
					</p>
					<p class="text-sm">{conflict.assignee.fullName} is on {conflict.reason}.</p>
					<Button
						variant="outline"
						size="sm"
						class="w-fit"
						disabled={busy}
						aria-label={`Find replacement for ${conflict.typeName}, ${conflict.dateLabel}`}
						onclick={(event) => onFindReplacement(conflict.typeId, conflict.dateKey, event.currentTarget)}
					>
						Find replacement
					</Button>
				</li>
			{/each}
		</ul>
	{/if}
</section>
