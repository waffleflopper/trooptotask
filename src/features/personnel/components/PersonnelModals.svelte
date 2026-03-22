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
	import type { PersonnelGroup } from '$features/personnel/utils/personnelGrouping';

	interface Props {
		ctx: PersonnelPageContext;
		personnelByGroup: PersonnelGroup[];
		orgId: string;
		allPersonnel: Personnel[];
	}

	let { ctx, personnelByGroup, orgId, allPersonnel }: Props = $props();

	async function handleSubmit(personData: Omit<Personnel, 'id'>) {
		if (ctx.editingPerson) {
			await personnelStore.update(ctx.editingPerson.id, personData);
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
				orgId,
				'personnel',
				id,
				`Archive ${person.rank} ${person.lastName}, ${person.firstName}`,
				`/org/${orgId}/personnel`
			);
		} else if (result === 'error') {
			toastStore.error('Failed to archive personnel');
		}
	}

	async function handleBulkImportComplete() {
		await invalidateAll();
		ctx.showBulkManager = false;
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
					orgId,
					'personnel',
					id,
					`Archive ${person.rank} ${person.lastName}, ${person.firstName}`,
					`/org/${orgId}/personnel`
				);
			}
		}
		if (archivedCount > 0) {
			toastStore.success(`${archivedCount} personnel archived`);
			await invalidateAll();
		}
		ctx.showBulkManager = false;
	}

	async function handleSaveRatingEntry(entryData: Omit<RatingSchemeEntry, 'id'>) {
		if (ctx.editingEntry) {
			await ratingSchemeStore.update(ctx.editingEntry.id, entryData);
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
			await submitDeletionRequest(orgId, 'rating_scheme_entry', id, desc, `/org/${orgId}/personnel`);
		}
	}
</script>

{#if ctx.showRatingModal}
	<RatingSchemeEntryModal
		entry={ctx.editingEntry}
		personnel={allPersonnel}
		onSave={handleSaveRatingEntry}
		onDelete={ctx.editingEntry ? handleDeleteRatingEntry : undefined}
		onClose={() => {
			ctx.showRatingModal = false;
			ctx.editingEntry = null;
		}}
	/>
{/if}

{#if ctx.showPersonnelModal}
	<PersonnelModal
		personnel={ctx.editingPerson}
		groups={groupsStore.list}
		onSubmit={handleSubmit}
		onRemove={handleArchive}
		onClose={() => ctx.closePersonnelModal()}
	/>
{/if}

{#if ctx.showGroupManager}
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
		onClose={() => (ctx.showGroupManager = false)}
	/>
{/if}

{#if ctx.showBulkManager}
	<BulkPersonnelManager
		{personnelByGroup}
		groups={groupsStore.list}
		{orgId}
		onImportComplete={handleBulkImportComplete}
		onBulkDelete={handleBulkArchive}
		onClose={() => (ctx.showBulkManager = false)}
	/>
{/if}
