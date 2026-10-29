<script lang="ts">
	import type { PersonnelPageContext } from '../contexts/PersonnelPageContext.svelte';
	import { withPendingOrder } from '../groupStructure';
	import { createGroupStructureCommands } from '../groupStructureCommands';
	import { groupManagementStore } from '../stores/groups.svelte';
	import GroupTreeEditor from './GroupTreeEditor.svelte';

	/** The Group tree editor wired to the Organization's stores, for pages outside Manage Groups. */
	let { ctx }: { ctx: PersonnelPageContext } = $props();

	const commands = $derived(createGroupStructureCommands(ctx.peek));
	const groups = $derived(withPendingOrder(groupManagementStore.items, groupManagementStore.pendingOrder));
</script>

<GroupTreeEditor {groups} people={ctx.allActivePersonnel} {commands} loading={groupManagementStore.loading} />
