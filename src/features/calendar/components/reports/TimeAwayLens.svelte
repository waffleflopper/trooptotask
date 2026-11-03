<script lang="ts">
	import type { ToolbarAction } from '$lib/components/patterns/workspace-toolbar';
	import PersonnelTempo from './PersonnelTempo.svelte';
	import StatusDaysSummary from './StatusDaysSummary.svelte';
	import type { LensProps } from './lensTypes';

	let { orgId, personnel, statusTypes, groups }: LensProps = $props();

	let statusDays = $state<StatusDaysSummary>();
	let tempo = $state<PersonnelTempo>();

	const named = (action: ToolbarAction | undefined, id: string): ToolbarAction[] => (action ? [{ ...action, id }] : []);

	export function exportActions(): ToolbarAction[] {
		return [
			...named(statusDays?.exportAction(), 'export-status-days'),
			...named(tempo?.exportAction(), 'export-away-days')
		];
	}
</script>

<div class="flex flex-col gap-10">
	<StatusDaysSummary bind:this={statusDays} {orgId} {personnel} {statusTypes} {groups} />
	<PersonnelTempo bind:this={tempo} {orgId} {personnel} {statusTypes} {groups} />
</div>
