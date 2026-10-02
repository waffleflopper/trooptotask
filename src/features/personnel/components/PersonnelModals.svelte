<script lang="ts">
	import type { Personnel } from '../personnel.types';
	import { personnelStore } from '$features/personnel/stores/personnel.svelte';
	import { groupManagementStore } from '$features/personnel/stores/groups.svelte';
	import PersonnelModal from '$features/personnel/components/PersonnelModal.svelte';
	import GroupManager from './GroupManager.svelte';
	import { archivePersonnel, type RequestPersonnelArchiveApproval } from '../utils/archivePersonnel';
	import { toastStore } from '$lib/stores/toast.svelte';
	import { invalidateAll } from '$app/navigation';
	import type { PersonnelPageContext } from '$features/personnel/contexts/PersonnelPageContext.svelte';
	import type { ModalRegistry } from '$lib/utils/modalRegistry.svelte';

	interface Props {
		ctx: PersonnelPageContext;
		modals: ModalRegistry;
		requestArchiveApproval: RequestPersonnelArchiveApproval;
	}

	let { ctx, modals, requestArchiveApproval }: Props = $props();

	const personnelPayload = $derived(modals.payload<{ person: Personnel | null }>('personnel-modal'));

	const editingPerson = $derived(personnelPayload?.person ?? null);

	async function handleSubmit(personData: Omit<Personnel, 'id'>) {
		if (editingPerson) {
			const updated = await personnelStore.update(editingPerson.id, personData);
			if (!updated) throw new Error('Failed to update personnel');
		} else {
			const created = await personnelStore.add(personData);
			if (!created) throw new Error('Failed to add personnel');
		}
	}

	async function handleArchive(id: string) {
		const person = personnelStore.getById(id);
		if (!person) {
			toastStore.error('Failed to archive personnel');
			return false;
		}
		const result = await archivePersonnel({ orgId: ctx.orgId, person, requestArchiveApproval });
		if (result === 'archived') {
			await invalidateAll();
		}
		return result !== 'error';
	}
</script>

{#if modals.isOpen('personnel-modal')}
	<PersonnelModal
		personnel={editingPerson}
		groups={editingPerson
			? groupManagementStore.items
			: groupManagementStore.items.filter((group) => ctx.canCreatePersonnelInGroup(group.id))}
		allowUnassigned={!!editingPerson || ctx.allowUnassignedPersonnel}
		rankCatalog={ctx.data.rankCatalog ?? []}
		onSubmit={handleSubmit}
		onRemove={handleArchive}
		onClose={modals.closerFor('personnel-modal')}
	/>
{/if}

{#if modals.isOpen('group-manager')}
	<GroupManager
		groups={groupManagementStore.items}
		onAdd={async (name) => {
			if (!(await groupManagementStore.add(name))) throw new Error('A Group with that name already exists.');
		}}
		onRemove={async (id) => {
			if (!(await groupManagementStore.remove(id))) throw new Error('Unable to remove Group. Try again.');
			personnelStore.updateLocalWhere(
				(p) => p.groupId === id,
				(p) => ({ ...p, groupId: null, groupName: '' })
			);
		}}
		onRename={async (id, name) => {
			if (!(await groupManagementStore.rename(id, name))) throw new Error('Unable to rename Group. Try again.');
			personnelStore.updateLocalWhere(
				(p) => p.groupId === id,
				(p) => ({ ...p, groupName: name })
			);
		}}
		onClose={modals.closerFor('group-manager')}
	/>
{/if}
