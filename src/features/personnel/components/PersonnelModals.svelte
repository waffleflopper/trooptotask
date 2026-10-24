<script lang="ts">
	import type { Personnel } from '../personnel.types';
	import { GROUP_NAME_EXISTS_MESSAGE, GROUP_UNAVAILABLE_MESSAGE } from '$features/personnel/contracts';
	import { personnelStore } from '$features/personnel/stores/personnel.svelte';
	import { groupManagementStore } from '$features/personnel/stores/groups.svelte';
	import { followPinnedGroupCatalogChange, pinnedGroupsStore } from '$features/personnel/stores/pinnedGroups.svelte';
	import PersonnelModal from '$features/personnel/components/PersonnelModal.svelte';
	import GroupEditor, { UNASSIGNED } from './GroupEditor.svelte';
	import { rosterStatusDot } from '../rosterSignals';
	import { moveGroupMembers } from '../utils/moveGroupMembers';
	import { archivePersonnel, type RequestPersonnelArchiveApproval } from '../utils/archivePersonnel';
	import { toastStore } from '$lib/stores/toast.svelte';
	import { rejectedRequestMessage, stillInOrganizationLifetime, withinOrganizationLifetime } from '$lib/stores/core';
	import { invalidate } from '$app/navigation';
	import type { PersonnelPageContext } from '$features/personnel/contexts/PersonnelPageContext.svelte';
	import { changesSignalApplicability } from '../rosterSignals';
	import type { ModalRegistry } from '$lib/utils/modalRegistry.svelte';

	interface Props {
		ctx: PersonnelPageContext;
		modals: ModalRegistry;
		requestArchiveApproval: RequestPersonnelArchiveApproval;
	}

	let { ctx, modals, requestArchiveApproval }: Props = $props();

	const personnelPayload = $derived(modals.payload<{ person: Personnel | null }>('personnel-modal'));

	const editingPerson = $derived(personnelPayload?.person ?? null);
	const groupEditorPayload = $derived(modals.payload<{ select: string | null }>('group-manager'));

	// An order still saving shows where its Groups will be.
	const editorGroups = $derived.by(() => {
		const pending = groupManagementStore.pendingOrder;
		if (!pending) return groupManagementStore.items;
		const position = new Map(pending.map((id, index) => [id, index]));
		return groupManagementStore.items.toSorted(
			(a, b) => (position.get(a.id) ?? Infinity) - (position.get(b.id) ?? Infinity)
		);
	});

	function setLocalGroup(predicate: (person: Personnel) => boolean, groupId: string | null) {
		const groupName = groupId ? (groupManagementStore.getById(groupId)?.name ?? '') : '';
		for (const person of personnelStore.items) {
			if (predicate(person)) ctx.peek.changed(person.id, { groupId: person.groupId }, { groupId });
		}
		personnelStore.updateLocalWhere(predicate, (person) => ({ ...person, groupId, groupName }));
	}

	async function renameGroup(id: string, name: string) {
		const previous = groupManagementStore.getById(id)?.name;
		const renamed = await groupManagementStore.rename(id, name).catch((failure: unknown) => {
			if (failure instanceof Error && failure.message === GROUP_NAME_EXISTS_MESSAGE) throw failure;
			throw new Error(rejectedRequestMessage(failure, 'Unable to rename Group. Try again.'));
		});
		if (!renamed) throw new Error(GROUP_UNAVAILABLE_MESSAGE);
		const saved = groupManagementStore.getById(id)?.name ?? name.trim();
		setLocalGroup((person) => person.groupId === id, id);
		if (previous) followPinnedGroupCatalogChange(previous, saved);
	}

	async function deleteGroup(id: string, moveMembersTo: string | null) {
		const orgId = groupManagementStore.orgId;
		const name = groupManagementStore.getById(id)?.name;
		await groupManagementStore.deleteWithReassignment(id, moveMembersTo);
		if (groupManagementStore.orgId !== orgId) return;
		setLocalGroup((person) => person.groupId === id, moveMembersTo);
		if (name) followPinnedGroupCatalogChange(name, null);
	}

	async function moveMembers(personnelIds: string[], groupId: string | null) {
		const orgId = ctx.orgId;
		const inLifetime = stillInOrganizationLifetime();
		const result = await withinOrganizationLifetime(moveGroupMembers(orgId, personnelIds, groupId), inLifetime);
		if (inLifetime() && personnelStore.orgId === orgId) {
			const moved = new Set(result.movedIds);
			setLocalGroup((person) => moved.has(person.id) && person.groupId !== groupId, groupId);
		}
		return result;
	}

	async function handleSubmit(personData: Omit<Personnel, 'id'>) {
		if (editingPerson) {
			const inOrganization = stillInOrganizationLifetime();
			const before = editingPerson;
			const updated = await personnelStore.updateOrThrow(before.id, personData);
			if (!updated) throw new Error('Failed to update personnel');
			if (!inOrganization()) return;
			ctx.peek.changed(before.id, before, personData);
			if (changesSignalApplicability(before, personData)) void ctx.signals.refresh([before.id]);
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
			await invalidate('app:personnel-data');
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
	<GroupEditor
		groups={editorGroups}
		people={ctx.allActivePersonnel}
		pinnedNames={pinnedGroupsStore.list}
		loading={groupManagementStore.loading}
		initialSelection={groupEditorPayload ? (groupEditorPayload.select ?? UNASSIGNED) : null}
		todayStatus={ctx.canViewAvailability
			? (person) => rosterStatusDot(ctx.signalRow(person), ctx.signals.statusTypes)
			: undefined}
		canMovePerson={(person) => ctx.canManagePersonnelRecord(person)}
		canMoveTo={(groupId) => ctx.canManagePersonnelInGroup(groupId)}
		onAdd={async (name) => {
			if (!(await groupManagementStore.add(name))) throw new Error(GROUP_NAME_EXISTS_MESSAGE);
		}}
		onRename={renameGroup}
		onReorder={(ids) => groupManagementStore.setOrder(ids)}
		onTogglePin={(name) => pinnedGroupsStore.toggle(name)}
		onDelete={deleteGroup}
		onMove={moveMembers}
		onClose={modals.closerFor('group-manager')}
	/>
{/if}
