import { personnelStore } from '$features/personnel/stores/personnel.svelte';
import { toastStore } from '$lib/stores/toast.svelte';
import { withinOrganizationLifetime } from '$lib/stores/core';
import type { Personnel } from '../personnel.types';

export type PersonnelArchiveResult = 'archived' | 'approval_requested' | 'error';

export type RequestPersonnelArchiveApproval = (request: {
	orgId: string;
	personnelId: string;
	description: string;
	resourceUrl: string;
}) => Promise<boolean>;

interface ArchivePersonnelOptions {
	orgId: string;
	person: Personnel;
	resourceUrl?: string;
	requestArchiveApproval: RequestPersonnelArchiveApproval;
}

async function archiveViaApi(orgId: string, id: string): Promise<'deleted' | 'approval_required' | 'error'> {
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
	resourceUrl = `/org/${orgId}/personnel`,
	requestArchiveApproval
}: ArchivePersonnelOptions): Promise<PersonnelArchiveResult> {
	const result =
		personnelStore.orgId === orgId && personnelStore.getById(person.id)
			? await personnelStore.remove(person.id)
			: await withinOrganizationLifetime(archiveViaApi(orgId, person.id));

	if (result === 'deleted') {
		toastStore.success('Personnel archived');
		return 'archived';
	}

	if (result === 'approval_required') {
		const submitted = await requestArchiveApproval({
			orgId,
			personnelId: person.id,
			description: `Archive ${person.rank} ${person.lastName}, ${person.firstName}`,
			resourceUrl
		});
		return submitted ? 'approval_requested' : 'error';
	}

	toastStore.error('Failed to archive personnel');
	return 'error';
}
