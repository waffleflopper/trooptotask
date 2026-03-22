<script lang="ts">
	import type { Personnel } from '$lib/types';
	import type { RatingSchemeEntry } from '$features/rating-scheme/rating-scheme.types';
	import { personnelStore } from '$features/personnel/stores/personnel.svelte';
	import { groupsStore } from '$lib/stores/groups.svelte';
	import { ratingSchemeStore } from '$features/rating-scheme/stores/ratingScheme.svelte';
	import PersonnelModal from '$features/personnel/components/PersonnelModal.svelte';
	import GroupManager from '$features/groups/components/GroupManager.svelte';
	import BulkPersonnelManager from '$features/personnel/components/BulkPersonnelManager.svelte';
	import RatingSchemeEntryModal from '$features/rating-scheme/components/RatingSchemeEntryModal.svelte';
	import { submitDeletionRequest } from '$lib/utils/deletionRequests';
	import { toastStore } from '$lib/stores/toast.svelte';
	import { invalidateAll } from '$app/navigation';
	import type { PersonnelPageContext } from '$features/personnel/contexts/PersonnelPageContext.svelte';
	import type { ModalRegistry } from '$lib/utils/modalRegistry.svelte';

	interface Props {
		ctx: PersonnelPageContext;
		modals: ModalRegistry;
		allPersonnel: Personnel[];
	}

	let { ctx, modals, allPersonnel }: Props = $props();

	const personnelPayload = $derived(modals.payload<{ person: Personnel | null }>('personnel-modal'));
	const ratingPayload = $derived(modals.payload<{ entry: RatingSchemeEntry | null }>('rating-modal'));

	const editingPerson = $derived(personnelPayload?.person ?? null);
	const editingEntry = $derived(ratingPayload?.entry ?? null);

	async function handleSubmit(personData: Omit<Personnel, 'id'>) {
		if (editingPerson) {
			await personnelStore.update(editingPerson.id, personData);
		} else {
			await personnelStore.add(personData);
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
		let archivedCount = 0;
		for (const id of ids) {
			const person = personnelStore.getById(id);
			const result = await personnelStore.remove(id);
			if (result === 'deleted') {
				archivedCount++;
			} else if (result === 'approval_required' && person) {
				await submitDeletionRequest(
					ctx.orgId,
					'personnel',
					id,
					`Archive ${person.rank} ${person.lastName}, ${person.firstName}`,
					`/org/${ctx.orgId}/personnel`
				);
			}
		}
		if (archivedCount > 0) {
			toastStore.success(`${archivedCount} personnel archived`);
			await invalidateAll();
		}
		modals.close('bulk-manager');
	}

	async function handleSaveRatingEntry(entryData: Omit<RatingSchemeEntry, 'id'>) {
		if (editingEntry) {
			await ratingSchemeStore.update(editingEntry.id, entryData);
		} else {
			await ratingSchemeStore.add(entryData);
		}
	}

	async function handleDeleteRatingEntry(id: string) {
		const entry = ratingSchemeStore.list.find((e) => e.id === id);
		const result = await ratingSchemeStore.remove(id);
		if (result === 'approval_required' && entry) {
			const person = allPersonnel.find((p) => p.id === entry.ratedPersonId);
			const desc = person ? `Rating scheme entry for ${person.rank} ${person.lastName}` : 'Rating scheme entry';
			await submitDeletionRequest(ctx.orgId, 'rating_scheme_entry', id, desc, `/org/${ctx.orgId}/personnel`);
		}
	}
</script>

{#if modals.isOpen('rating-modal')}
	<RatingSchemeEntryModal
		entry={editingEntry}
		personnel={allPersonnel}
		onSave={handleSaveRatingEntry}
		onDelete={editingEntry ? handleDeleteRatingEntry : undefined}
		onClose={modals.closerFor('rating-modal')}
	/>
{/if}

{#if modals.isOpen('personnel-modal')}
	<PersonnelModal
		personnel={editingPerson}
		groups={groupsStore.list}
		onSubmit={handleSubmit}
		onRemove={handleArchive}
		onClose={modals.closerFor('personnel-modal')}
	/>
{/if}

{#if modals.isOpen('group-manager')}
	<GroupManager
		groups={groupsStore.list}
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
		groups={groupsStore.list}
		orgId={ctx.orgId}
		onImportComplete={handleBulkImportComplete}
		onBulkDelete={handleBulkArchive}
		onClose={modals.closerFor('bulk-manager')}
	/>
{/if}
