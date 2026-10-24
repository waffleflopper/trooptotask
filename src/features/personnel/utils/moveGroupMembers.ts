import { buildRequestError, rejectedRequestMessage } from '$lib/stores/core';
import { GROUP_CHANGE_UNCONFIRMED_MESSAGE } from '../contracts';

export interface GroupMembershipChange {
	groupId: string | null;
	movedIds: string[];
	unavailableIds: string[];
}

export async function moveGroupMembers(
	orgId: string,
	personnelIds: string[],
	groupId: string | null
): Promise<GroupMembershipChange> {
	let response: Response;
	try {
		response = await fetch(`/org/${orgId}/api/personnel/group-membership`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ personnelIds, groupId })
		});
	} catch {
		throw new Error(GROUP_CHANGE_UNCONFIRMED_MESSAGE);
	}
	if (!response.ok) {
		const failure = await buildRequestError(response, 'POST', 'personnel/group-membership');
		throw new Error(rejectedRequestMessage(failure, GROUP_CHANGE_UNCONFIRMED_MESSAGE));
	}
	const result: unknown = await response.json().catch(() => null);
	const { movedIds, unavailableIds } = (result ?? {}) as Partial<GroupMembershipChange>;
	const requested = new Set(personnelIds);
	const isIdList = (ids: unknown): ids is string[] =>
		Array.isArray(ids) && ids.every((id) => typeof id === 'string' && requested.has(id));
	if (!isIdList(movedIds) || !isIdList(unavailableIds)) throw new Error(GROUP_CHANGE_UNCONFIRMED_MESSAGE);
	return { groupId, movedIds, unavailableIds };
}
