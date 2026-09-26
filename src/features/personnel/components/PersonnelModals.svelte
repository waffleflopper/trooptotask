<script lang="ts">
	import type { Personnel } from '$lib/types';
	import { personnelStore } from '$features/personnel/stores/personnel.svelte';
	import { groupManagementStore } from '$features/personnel/stores/groups.svelte';
	import PersonnelModal from '$features/personnel/components/PersonnelModal.svelte';
	import GroupManager from '$features/groups/components/GroupManager.svelte';
	import { submitDeletionRequest } from '$lib/utils/deletionRequests';
	import { toastStore } from '$lib/stores/toast.svelte';
	import { invalidateAll } from '$app/navigation';
	import type { PersonnelPageContext } from '$features/personnel/contexts/PersonnelPageContext.svelte';
	import type { ModalRegistry } from '$lib/utils/modalRegistry.svelte';

	interface Props {
		ctx: PersonnelPageContext;
		modals: ModalRegistry;
	}

	let { ctx, modals }: Props = $props();

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
		const result = await personnelStore.remove(id);
		if (result === 'deleted') {
			toastStore.success('Personnel archived');
			await invalidateAll();
		} else if (result === 'approval_required' && person) {
			await submitDeletionRequest(
				ctx.orgId,
				'personnel',
				id,
				`Archive ${person.rank} ${person.lastName}, ${person.firstName}`,
				`/org/${ctx.orgId}/personnel`
			);
		} else if (result === 'error') {
			toastStore.error('Failed to archive personnel');
		}
	}
</script>

{#if modals.isOpen('personnel-modal')}
	<PersonnelModal
		personnel={editingPerson}
		groups={groupManagementStore.items}
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
