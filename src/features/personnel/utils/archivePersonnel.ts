import { personnelStore } from '$features/personnel/stores/personnel.svelte';
import { toastStore } from '$lib/stores/toast.svelte';
import { stillInOrganizationLifetime, withinOrganizationLifetime } from '$lib/stores/core';
import { ARCHIVE_UNDO_MS, archiveUndoAction } from './archiveUndo';
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

type ArchiveReply = { kind: 'deleted'; undo?: string } | { kind: 'approval_required' } | { kind: 'error' };

async function archiveViaApi(orgId: string, id: string): Promise<ArchiveReply> {
	try {
		const response = await fetch(`/org/${orgId}/api/personnel`, {
			method: 'DELETE',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ id })
		});

		if (response.status === 202) {
			const body = (await response.json()) as { requiresApproval?: boolean };
			if (body.requiresApproval) return { kind: 'approval_required' };
		}
		if (!response.ok) return { kind: 'error' };

		const body: unknown = await response.json().catch(() => null);
		const undo = (body as { undo?: unknown } | null)?.undo;
		return typeof undo === 'string' ? { kind: 'deleted', undo } : { kind: 'deleted' };
	} catch {
		return { kind: 'error' };
	}
}

export async function archivePersonnel({
	orgId,
	person,
	resourceUrl = `/org/${orgId}/personnel`,
	requestArchiveApproval
}: ArchivePersonnelOptions): Promise<PersonnelArchiveResult> {
	const inLifetime = stillInOrganizationLifetime();
	const reply = await withinOrganizationLifetime(archiveViaApi(orgId, person.id));

	if (reply.kind === 'deleted') {
		if (personnelStore.orgId === orgId) personnelStore.removeLocal(person.id);
		// The record's page leaves for the roster right after, so Undo follows the Organization, not this page.
		if (reply.undo)
			toastStore.success('Personnel archived', ARCHIVE_UNDO_MS, archiveUndoAction(orgId, reply.undo, inLifetime));
		else toastStore.success('Personnel archived');
		return 'archived';
	}

	if (reply.kind === 'approval_required') {
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
