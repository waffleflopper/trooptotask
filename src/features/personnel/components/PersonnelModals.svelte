<script lang="ts">
	import type { Personnel } from '../personnel.types';
	import { personnelStore } from '$features/personnel/stores/personnel.svelte';
	import { groupManagementStore } from '$features/personnel/stores/groups.svelte';
	import { pinnedGroupsStore } from '$features/personnel/stores/pinnedGroups.svelte';
	import PersonnelModal from '$features/personnel/components/PersonnelModal.svelte';
	import GroupEditor, { UNASSIGNED } from './GroupEditor.svelte';
	import { rosterStatusDot } from '../rosterSignals';
	import { moveGroupMembers } from '../utils/moveGroupMembers';
	import { createGroupStructureCommands, setLocalGroup } from '../groupStructureCommands';
	import { withPendingOrder } from '../groupStructure';
	import { stillInOrganizationLifetime, withinOrganizationLifetime } from '$lib/stores/core';
	import type { PersonnelPageContext } from '$features/personnel/contexts/PersonnelPageContext.svelte';
	import type { ModalRegistry } from '$lib/utils/modalRegistry.svelte';

	interface Props {
		ctx: PersonnelPageContext;
		modals: ModalRegistry;
	}

	let { ctx, modals }: Props = $props();

	const groupEditorPayload = $derived(modals.payload<{ select: string | null }>('group-manager'));

	const editorGroups = $derived(withPendingOrder(groupManagementStore.items, groupManagementStore.pendingOrder));
	const groupCommands = $derived(createGroupStructureCommands(ctx.peek));

	async function moveMembers(personnelIds: string[], groupId: string | null) {
		const orgId = ctx.orgId;
		const inLifetime = stillInOrganizationLifetime();
		const result = await withinOrganizationLifetime(moveGroupMembers(orgId, personnelIds, groupId), inLifetime);
		if (inLifetime() && personnelStore.orgId === orgId) {
			const moved = new Set(result.movedIds);
			setLocalGroup(ctx.peek, (person) => moved.has(person.id) && person.groupId !== groupId, groupId);
		}
		return result;
	}

	async function handleSubmit(personData: Omit<Personnel, 'id'>) {
		const created = await personnelStore.add(personData);
		if (!created) throw new Error('Failed to add personnel');
	}
</script>

{#if modals.isOpen('personnel-modal')}
	<PersonnelModal
		groups={groupManagementStore.items.filter((group) => ctx.canCreatePersonnelInGroup(group.id))}
		allowUnassigned={ctx.allowUnassignedPersonnel}
		rankCatalog={ctx.data.rankCatalog ?? []}
		organizationName={ctx.orgName}
		onSubmit={handleSubmit}
		onClose={modals.closerFor('personnel-modal')}
	/>
{/if}

{#if modals.isOpen('group-manager')}
	<GroupEditor
		groups={editorGroups}
		people={ctx.allActivePersonnel}
		pinnedGroupIds={pinnedGroupsStore.list}
		loading={groupManagementStore.loading}
		initialSelection={groupEditorPayload ? (groupEditorPayload.select ?? UNASSIGNED) : null}
		todayStatus={ctx.canViewAvailability
			? (person) => rosterStatusDot(ctx.signalRow(person), ctx.signals.statusTypes)
			: undefined}
		canMovePerson={(person) => ctx.canManagePersonnelRecord(person)}
		canMoveTo={(groupId) => ctx.canManagePersonnelInGroup(groupId)}
		commands={groupCommands}
		onTogglePin={(groupId) => pinnedGroupsStore.toggle(groupId)}
		onMove={moveMembers}
		onClose={modals.closerFor('group-manager')}
	/>
{/if}
