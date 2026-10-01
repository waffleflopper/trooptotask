import type { RequestPersonnelArchiveApproval } from '$features/personnel';
import { toastStore } from '$lib/stores/toast.svelte';

/** Bind the Personnel archive intent to the existing approval transport. */
export const requestPersonnelArchiveApproval: RequestPersonnelArchiveApproval = async (request) => {
	try {
		const response = await fetch(`/org/${request.orgId}/api/deletion-requests`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				resourceType: 'personnel',
				resourceId: request.personnelId,
				resourceDescription: request.description,
				resourceUrl: request.resourceUrl
			})
		});
		if (response.status === 409) {
			toastStore.info('An archival request for this item is already pending.');
			return true;
		}
		if (!response.ok) {
			toastStore.error('Failed to submit archival request.');
			return false;
		}
		toastStore.info('Archival request submitted for admin approval.');
		return true;
	} catch {
		toastStore.error('Failed to submit archival request.');
		return false;
	}
};
