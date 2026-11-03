<script lang="ts">
	import type { ToolbarAction } from '$lib/components/patterns/workspace-toolbar';
	import AssignmentCoverage from './AssignmentCoverage.svelte';
	import type { LensProps } from './lensTypes';

	let { orgId, personnel, statusTypes, groups }: LensProps = $props();

	let coverage = $state<AssignmentCoverage>();

	export function exportActions(): ToolbarAction[] {
		const action = coverage?.exportAction();
		return action ? [action] : [];
	}
</script>

<AssignmentCoverage bind:this={coverage} {orgId} {personnel} {statusTypes} {groups} />
