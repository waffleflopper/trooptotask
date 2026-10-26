<script lang="ts">
	import type { TaskingReadiness } from '../taskingListsModel';

	let { readiness }: { readiness: TaskingReadiness } = $props();
</script>

{#if readiness.equipment || readiness.checklist}
	<span class="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
		{#if readiness.equipment}
			<span class="flex gap-x-1">
				<span>Equipment {readiness.equipment.ready} of {readiness.equipment.total} ready</span>
				{#if readiness.equipment.partial > 0}
					<span class="text-warning-foreground">· {readiness.equipment.partial} partial</span>
				{/if}
			</span>
		{/if}
		{#if readiness.checklist}
			<span>Checklist {readiness.checklist.done}/{readiness.checklist.total}</span>
		{/if}
	</span>
{/if}
