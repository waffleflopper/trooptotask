import { personnelStore } from '$features/personnel/stores/personnel.svelte';
import { toastStore } from '$lib/stores/toast.svelte';
import { submitDeletionRequest, type DeleteResult } from '$lib/utils/deletionRequests';
import type { Personnel } from '$lib/types';

export type PersonnelArchiveResult = 'archived' | 'approval_requested' | 'error';

interface ArchivePersonnelOptions {
	orgId: string;
	person: Personnel;
	resourceUrl?: string;
}

async function archiveViaApi(orgId: string, id: string): Promise<DeleteResult> {
	try {
		const response = await fetch(`/org/${orgId}/api/personnel`, {
			method: 'DELETE',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ id })
		});

		if (response.status === 202) {
			const body = (await response.json()) as { requiresApproval?: boolean };
			if (body.requiresApproval) return 'approval_required';
		}

		return response.ok ? 'deleted' : 'error';
	} catch {
		return 'error';
	}
}

export async function archivePersonnel({
	orgId,
	person,
	resourceUrl = `/org/${orgId}/personnel`
}: ArchivePersonnelOptions): Promise<PersonnelArchiveResult> {
	const result =
		personnelStore.orgId === orgId && personnelStore.getById(person.id)
			? await personnelStore.remove(person.id)
			: await archiveViaApi(orgId, person.id);

	if (result === 'deleted') {
		toastStore.success('Personnel archived');
		return 'archived';
	}

	if (result === 'approval_required') {
		const submitted = await submitDeletionRequest(
			orgId,
			'personnel',
			person.id,
			`Archive ${person.rank} ${person.lastName}, ${person.firstName}`,
			resourceUrl
		);
		return submitted ? 'approval_requested' : 'error';
	}

	toastStore.error('Failed to archive personnel');
	return 'error';
}
