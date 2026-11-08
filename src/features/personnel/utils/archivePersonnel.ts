import { page } from '$app/state';
import { personnelStore } from '$features/personnel/stores/personnel.svelte';
import { toastStore } from '$lib/stores/toast.svelte';
import { stillInOrganizationLifetime, withinOrganizationLifetime } from '$lib/stores/core';
import { ARCHIVE_UNDO_MS, archiveUndoAction } from './archiveUndo';
import { bulkArchivePersonnel } from './bulkArchivePersonnel';
import type { Personnel } from '../personnel.types';

export type PersonnelArchiveResult = 'archived' | 'approval_requested' | 'error';

interface ArchivePersonnelOptions {
	orgId: string;
	person: Personnel;
	/** Where a successful archive sends the reader. Its Undo stays good there as well as on the page that started it. */
	archivedPath: string;
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
	archivedPath
}: ArchivePersonnelOptions): Promise<PersonnelArchiveResult> {
	const inLifetime = stillInOrganizationLifetime();
	const startedOn = page.url.pathname;
	const undoOn =
		(...paths: string[]) =>
		() =>
			inLifetime() && paths.includes(page.url.pathname);
	const reply = await withinOrganizationLifetime(archiveViaApi(orgId, person.id));

	if (reply.kind === 'deleted') {
		if (personnelStore.orgId === orgId) personnelStore.removeLocal(person.id);
		if (reply.undo)
			toastStore.success(
				'Personnel archived',
				ARCHIVE_UNDO_MS,
				archiveUndoAction(orgId, reply.undo, undoOn(startedOn, archivedPath))
			);
		else toastStore.success('Personnel archived');
		return 'archived';
	}

	if (reply.kind === 'approval_required') {
		try {
			const result = await withinOrganizationLifetime(bulkArchivePersonnel(orgId, [person.id]));
			if (result.approvalRequestedIds.includes(person.id)) {
				if (result.undo)
					toastStore.success(
						'Archival request submitted for admin approval',
						ARCHIVE_UNDO_MS,
						archiveUndoAction(orgId, result.undo, undoOn(startedOn))
					);
				else toastStore.info('An archival request for this item is already pending.');
				return 'approval_requested';
			}
		} catch {
			// Falls through to the same failure as a refused request.
		}
	}

	toastStore.error('Failed to archive personnel');
	return 'error';
}
