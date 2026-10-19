<script lang="ts">
	import { ReadinessItemTable, type ReadinessItemRow } from '$lib/components/patterns/readiness-items';
	import { Button } from '$lib/components/ui/button/index.js';
	import { describeTrainingItem, type PersonnelTrainingReadiness } from '../utils/personnelTrainingItems';

	let {
		readiness,
		onOpen,
		onLog
	}: {
		readiness: PersonnelTrainingReadiness;
		onOpen: (typeId: string) => void;
		/** Absent when the viewer cannot record completions. */
		onLog?: () => void;
	} = $props();

	const rows = $derived(
		readiness.items.map(
			(item): ReadinessItemRow => ({
				id: item.typeId,
				status: item.status,
				name: item.name,
				detail: describeTrainingItem(item),
				recordedOn: item.completion?.completionDate ?? null,
				expiresOn: item.completion?.expirationDate ?? null
			})
		)
	);
	const audience = $derived(readiness.mos || 'this Soldier');
</script>

<ReadinessItemTable
	eyebrow="Training"
	note="Expiring still counts as ready"
	itemLabel="Training type"
	recordedLabel="Completed"
	{rows}
	emptyMessage={`No training is required for ${audience}.`}
	{onOpen}
>
	{#snippet action()}
		{#if onLog}
			<Button variant="outline" onclick={onLog}>Log completion</Button>
		{/if}
	{/snippet}
	{#snippet footerEnd()}
		<span class="text-muted-foreground">
			{readiness.notRequiredCount} not required for {audience} · {readiness.exemptCount} exempt
		</span>
	{/snippet}
</ReadinessItemTable>
