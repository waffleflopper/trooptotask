import { toastStore } from '$lib/stores/toast.svelte';

export type DeleteResult = 'deleted' | 'approval_required' | 'error';

/**
 * After a store's remove() returns 'approval_required', call this to
 * create the deletion request on the server and show a toast.
 */
export async function submitDeletionRequest(
	orgId: string,
	resourceType: string,
	resourceId: string,
	resourceDescription: string,
	resourceUrl?: string
): Promise<boolean> {
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

		if (res.status === 409) {
			toastStore.info('A deletion request for this item is already pending.');
			return true;
		}

		if (!res.ok) {
			toastStore.error('Failed to submit deletion request.');
			return false;
		}

		toastStore.info('Deletion request submitted for admin approval.');
		return true;
	} catch {
		toastStore.error('Failed to submit deletion request.');
		return false;
	}
}

export async function loadPendingDeletions(orgId: string): Promise<Set<string>> {
	try {
		const response = await fetch(`/org/${orgId}/api/deletion-requests?status=pending`);
		if (response.ok) {
			const requests = await response.json();
			return new Set(requests.map((r: { resource_id: string }) => r.resource_id));
		}
	} catch {
		// Ignore errors
	}
	return new Set();
}

export async function cancelDeletionRequest(orgId: string, requestId: string): Promise<boolean> {
	const response = await fetch(`/org/${orgId}/api/deletion-requests`, {
		method: 'DELETE',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ id: requestId })
	});
	return response.ok;
}
