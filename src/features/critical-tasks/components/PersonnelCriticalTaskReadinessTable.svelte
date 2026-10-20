<script lang="ts">
	import { resolve } from '$app/paths';
	import { ReadinessItemTable, type ReadinessItemRow } from '$lib/components/patterns/readiness-items';
	import { Button } from '$lib/components/ui/button/index.js';
	import { describeCriticalTaskItem, type PersonnelCriticalTaskReadiness } from '../utils/personnelCriticalTaskItems';

	let {
		readiness,
		orgId,
		onOpen,
		onRecord
	}: {
		readiness: PersonnelCriticalTaskReadiness;
		orgId: string;
		onOpen: (taskId: string) => void;
		/** Absent when the viewer cannot record validations. */
		onRecord?: () => void;
	} = $props();

	const rows = $derived(
		readiness.items.map(
			(item): ReadinessItemRow => ({
				id: item.taskId,
				status: item.status,
				name: item.name,
				detail: describeCriticalTaskItem(item),
				recordedOn: item.latest?.completedAt ?? null,
				expiresOn: item.expirationDate
			})
		)
	);
	const expiringCount = $derived(readiness.items.filter((item) => item.status === 'expiring').length);
	const note = $derived(
		expiringCount === 0
			? `Nothing expiring in the next ${readiness.expiringSoonWarningDays} days`
			: `${expiringCount} expiring in the next ${readiness.expiringSoonWarningDays} days`
	);
	const eyebrow = $derived(readiness.mos ? `Critical tasks · ${readiness.mos} ICTL` : 'Critical tasks');
</script>

<ReadinessItemTable
	{eyebrow}
	{note}
	itemLabel="Task"
	recordedLabel="Validated"
	{rows}
	emptyMessage={`No critical tasks apply to ${readiness.mos || 'this Soldier'}.`}
	{onOpen}
>
	{#snippet action()}
		{#if onRecord}
			<Button variant="outline" onclick={onRecord}>Record validation</Button>
		{/if}
	{/snippet}
	{#snippet footerEnd()}
		<a
			class="text-foreground underline underline-offset-4"
			href={resolve('/org/[orgId]/critical-tasks/(workspace)/[personnelId]', {
				orgId,
				personnelId: readiness.personnelId
			})}
		>
			Full task history in Critical Tasks
		</a>
	{/snippet}
</ReadinessItemTable>
