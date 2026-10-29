import { GROUP_NAME_EXISTS_MESSAGE, GROUP_UNAVAILABLE_MESSAGE, type Group } from './contracts';
import type { Personnel } from './personnel.types';
import type { RosterPeek } from './rosterPeek.svelte';
import { rejectedRequestMessage } from '$lib/stores/core';
import { groupManagementStore, type GroupOrderChange } from './stores/groups.svelte';
import { forgetGroupPin } from './stores/pinnedGroups.svelte';
import { personnelStore } from './stores/personnel.svelte';

/** The Group structure changes Manage Groups and Organization setup make, with the roster kept in step. */
export interface GroupStructureCommands {
	add(name: string, parentId: string | null): Promise<Group>;
	rename(id: string, name: string): Promise<void>;
	move(id: string, parentId: string | null): Promise<void>;
	reorder(ids: string[], parentId: string | null): Promise<GroupOrderChange>;
	/** Deletes the Group and its sub-groups, and moves everyone in them to `moveMembersTo` (null is Unassigned). */
	remove(id: string, moveMembersTo: string | null): Promise<void>;
}

export function setLocalGroup(peek: RosterPeek, predicate: (person: Personnel) => boolean, groupId: string | null) {
	const groupName = groupId ? (groupManagementStore.getById(groupId)?.name ?? '') : '';
	for (const person of personnelStore.items) {
		if (predicate(person)) peek.changed(person.id, { groupId: person.groupId }, { groupId });
	}
	personnelStore.updateLocalWhere(predicate, (person) => ({ ...person, groupId, groupName }));
}

export function createGroupStructureCommands(peek: RosterPeek): GroupStructureCommands {
	return {
		async add(name, parentId) {
			const added = await groupManagementStore.add(name, parentId);
			if (!added) throw new Error(GROUP_NAME_EXISTS_MESSAGE);
			return added;
		},

		async rename(id, name) {
			const renamed = await groupManagementStore.rename(id, name).catch((failure: unknown) => {
				if (failure instanceof Error && failure.message === GROUP_NAME_EXISTS_MESSAGE) throw failure;
				throw new Error(rejectedRequestMessage(failure, 'Unable to rename Group. Try again.'));
			});
			if (!renamed) throw new Error(GROUP_UNAVAILABLE_MESSAGE);
			setLocalGroup(peek, (person) => person.groupId === id, id);
		},

		async move(id, parentId) {
			const orgId = groupManagementStore.orgId;
			await groupManagementStore.move(id, parentId);
			if (groupManagementStore.orgId !== orgId) return;
			// Only top-level Groups can be pinned, and the database drops the pin when one moves under a parent.
			if (parentId !== null) forgetGroupPin(id);
		},

		reorder(ids, parentId) {
			return groupManagementStore.setOrder(ids, parentId);
		},

		async remove(id, moveMembersTo) {
			const orgId = groupManagementStore.orgId;
			const { deletedIds } = await groupManagementStore.deleteWithReassignment(id, moveMembersTo);
			if (groupManagementStore.orgId !== orgId) return;
			const deleted = new Set(deletedIds);
			setLocalGroup(peek, (person) => person.groupId !== null && deleted.has(person.groupId), moveMembersTo);
			for (const groupId of deletedIds) forgetGroupPin(groupId);
		}
	};
}
