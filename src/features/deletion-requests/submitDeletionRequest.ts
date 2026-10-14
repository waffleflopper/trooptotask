import { toastStore } from '$lib/stores/toast.svelte';
import { stillInOrganizationLifetime } from '$lib/stores/core';

/**
 * After a store's remove() returns 'approval_required', call this to
 * create the deletion request on the server and show a toast.
 */
export async function submitDeletionRequest(
	orgId: string,
	resourceType: string,
	resourceId: string,
	resourceDescription: string,
	resourceUrl?: string,
	isCurrent: () => boolean = stillInOrganizationLifetime()
): Promise<boolean> {
	if (!isCurrent()) return false;

	const isPersonnel = resourceType === 'personnel';
	const action = isPersonnel ? 'archival' : 'deletion';

	try {
		const res = await fetch(`/org/${orgId}/api/deletion-requests`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				resourceType,
				resourceId,
				resourceDescription,
				resourceUrl: resourceUrl ?? null
			})
		});
		if (!isCurrent()) return false;

		if (res.status === 409) {
			toastStore.info(`An ${action} request for this item is already pending.`);
			return true;
		}

		if (!res.ok) {
			toastStore.error(`Failed to submit ${action} request.`);
			return false;
		}

		toastStore.info(`${isPersonnel ? 'Archival' : 'Deletion'} request submitted for admin approval.`);
		return true;
	} catch {
		if (!isCurrent()) return false;
		toastStore.error(`Failed to submit ${action} request.`);
		return false;
	}
}
