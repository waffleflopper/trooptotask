<script lang="ts">
	import type { Personnel } from '$lib/types';
	import { personnelStore } from '$features/personnel/stores/personnel.svelte';
	import { groupsStore } from '$lib/stores/groups.svelte';
	import PersonnelModal from '$features/personnel/components/PersonnelModal.svelte';
	import GroupManager from '$features/groups/components/GroupManager.svelte';
	import BulkPersonnelManager from '$features/personnel/components/BulkPersonnelManager.svelte';
	import { submitDeletionRequest } from '$lib/utils/deletionRequests';
	import { toastStore } from '$lib/stores/toast.svelte';
	import { invalidateAll } from '$app/navigation';
	import { bulkArchivePersonnel } from '$features/personnel/utils/bulkArchivePersonnel';
	import type { PersonnelPageContext } from '$features/personnel/contexts/PersonnelPageContext.svelte';
	import type { ModalRegistry } from '$lib/utils/modalRegistry.svelte';

	interface Props {
		ctx: PersonnelPageContext;
		modals: ModalRegistry;
	}

	let { ctx, modals }: Props = $props();

	const personnelPayload = $derived(modals.payload<{ person: Personnel | null }>('personnel-modal'));
	const bulkManagerPayload = $derived(modals.payload<{ initialTab?: 'import' | 'merge' | 'delete' }>('bulk-manager'));

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

	async function handleBulkImportComplete() {
		await invalidateAll();
		modals.close('bulk-manager');
	}

	async function handleBulkArchive(ids: string[]) {
		const result = await bulkArchivePersonnel(ctx.orgId, ids);

		for (const id of result.archivedIds) {
			personnelStore.removeLocal(id);
		}

		if (result.archivedIds.length > 0) {
			toastStore.success(`${result.archivedIds.length} personnel archived`);
			await invalidateAll();
		}
		if (result.approvalRequestedIds.length > 0) {
			toastStore.info(`${result.approvalRequestedIds.length} archival requests submitted for admin approval.`);
			await invalidateAll();
		}
		if (result.errors.length > 0) {
			toastStore.error(`${result.errors.length} personnel could not be archived.`);
		}
		modals.close('bulk-manager');
	}
</script>

{#if modals.isOpen('personnel-modal')}
	<PersonnelModal
		personnel={editingPerson}
		groups={groupsStore.items}
		onSubmit={handleSubmit}
		onRemove={handleArchive}
		onClose={modals.closerFor('personnel-modal')}
	/>
{/if}

{#if modals.isOpen('group-manager')}
	<GroupManager
		groups={groupsStore.items}
		onAdd={(name) => groupsStore.add(name)}
		onRemove={async (id) => {
			await groupsStore.remove(id);
			personnelStore.updateLocalWhere(
				(p) => p.groupId === id,
				(p) => ({ ...p, groupId: null, groupName: '' })
			);
		}}
		onRename={async (id, name) => {
			await groupsStore.rename(id, name);
			personnelStore.updateLocalWhere(
				(p) => p.groupId === id,
				(p) => ({ ...p, groupName: name })
			);
		}}
		onClose={modals.closerFor('group-manager')}
	/>
{/if}

{#if modals.isOpen('bulk-manager')}
	<BulkPersonnelManager
		personnelByGroup={ctx.personnelByGroup}
		groups={groupsStore.items}
		orgId={ctx.orgId}
		onImportComplete={handleBulkImportComplete}
		onBulkDelete={handleBulkArchive}
		onClose={modals.closerFor('bulk-manager')}
		initialTab={bulkManagerPayload?.initialTab ?? 'import'}
		readOnly={ctx.readOnly}
	/>
{/if}
