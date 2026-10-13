// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PersonnelArchivedArtifact } from '$features/personnel/contracts';
import PersonnelArchivedArtifactsPageView from './PersonnelArchivedArtifactsPageView.svelte';

function note(id: string, text: string): PersonnelArchivedArtifact {
	return {
		kind: 'note',
		id,
		personnelId: 'person-1',
		author: 'SGT Lead',
		date: '2026-01-01',
		text,
		createdAt: '2026-01-01T00:00:00Z',
		archivedAt: '2026-02-01T00:00:00Z'
	};
}

function renderView(records: PersonnelArchivedArtifact[]) {
	return render(PersonnelArchivedArtifactsPageView, {
		props: {
			data: {
				orgId: 'org-1',
				personnelId: 'person-1',
				title: 'Archived leader notes',
				emptyState: 'Nothing archived.',
				records
			}
		}
	});
}

function heldFetch() {
	const requests: Array<{ url: string; method: string | undefined }> = [];
	const settlers: Array<(response: { ok: boolean; json(): Promise<unknown> }) => void> = [];
	vi.stubGlobal(
		'fetch',
		vi.fn((url: string, init?: { method?: string }) => {
			requests.push({ url, method: init?.method });
			return new Promise((resolve) => settlers.push(resolve));
		})
	);
	return {
		requests,
		settle: (index: number, ok: boolean, body: unknown = { success: ok }) =>
			settlers[index]({ ok, json: async () => body })
	};
}

async function openDelete(title: string) {
	const article = screen.getByRole('heading', { name: title }).closest('article') as HTMLElement;
	await fireEvent.click(within(article).getByRole('button', { name: 'Delete' }));
	return screen.getByRole('alertdialog', { name: 'Delete archived item' });
}

function confirmDelete(dialog: HTMLElement) {
	return fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));
}

function rowOf(title: string) {
	return screen.getByRole('heading', { name: title }).closest('article') as HTMLElement;
}

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

describe('archived item deletion', () => {
	it('says when a deleted document still has file cleanup pending', async () => {
		const held = heldFetch();
		renderView([
			{
				kind: 'document',
				id: 'd1',
				personnelId: 'person-1',
				title: 'Signed form',
				fileName: 'form.pdf',
				fileSizeBytes: 10,
				contentType: 'application/pdf',
				uploadedBy: 'SGT Lead',
				createdAt: '2026-01-01T00:00:00Z',
				archivedAt: '2026-02-01T00:00:00Z'
			},
			note('n1', 'Note')
		]);

		await confirmDelete(await openDelete('Signed form'));
		held.settle(0, true, { success: true, fileCleanup: 'pending' });
		await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
		expect(screen.getByRole('status').textContent).toContain(
			'Deleted Signed form. Its stored file will be removed automatically.'
		);
		expect(screen.queryByRole('alert')).toBeNull();

		await confirmDelete(await openDelete('Note'));
		held.settle(1, true, { success: true });
		await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
		expect(screen.queryByRole('status')).toBeNull();
	});

	it('keeps the confirmation open and busy until the request settles, then closes it', async () => {
		const held = heldFetch();
		renderView([note('n1', 'First note'), note('n2', 'Second note')]);

		const dialog = await openDelete('First note');
		await confirmDelete(dialog);
		await waitFor(() => expect(held.requests).toHaveLength(1));
		expect(held.requests[0]).toEqual({ url: '/org/org-1/api/personnel/person-1/leader-notes/n1', method: 'DELETE' });

		expect(dialog.getAttribute('aria-busy')).toBe('true');
		await fireEvent.keyDown(dialog, { key: 'Escape' });
		expect(screen.getByRole('alertdialog', { name: 'Delete archived item' })).toBeTruthy();
		expect((within(dialog).getByRole('button', { name: 'Cancel' }) as HTMLButtonElement).disabled).toBe(true);
		expect(screen.getByRole('heading', { name: 'First note' })).toBeTruthy();

		held.settle(0, true);
		await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
		expect(screen.queryByRole('heading', { name: 'First note' })).toBeNull();
	});

	it('keeps the confirmation open with the failure message and retries the same delete', async () => {
		const held = heldFetch();
		renderView([note('n1', 'First note'), note('n2', 'Second note')]);

		const dialog = await openDelete('First note');
		await confirmDelete(dialog);
		held.settle(0, false);

		await waitFor(() => expect(dialog.hasAttribute('aria-busy')).toBe(false));
		expect(within(dialog).getByRole('alert').textContent).toContain('Unable to delete archived item.');
		expect(screen.getAllByRole('alert')).toHaveLength(1);
		expect(screen.getByRole('heading', { name: 'First note' })).toBeTruthy();

		await confirmDelete(dialog);
		await waitFor(() => expect(held.requests).toHaveLength(2));
		held.settle(1, true);
		await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
		expect(screen.queryByRole('heading', { name: 'First note' })).toBeNull();
		expect(screen.queryByRole('alert')).toBeNull();
	});

	it('clears the failure when the confirmation is cancelled and reopened', async () => {
		const held = heldFetch();
		renderView([note('n1', 'First note')]);

		const dialog = await openDelete('First note');
		await confirmDelete(dialog);
		held.settle(0, false);
		await waitFor(() => expect(dialog.hasAttribute('aria-busy')).toBe(false));
		expect(within(dialog).getByRole('alert')).toBeTruthy();

		await fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
		await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
		const reopened = await openDelete('First note');
		expect(within(reopened).queryByRole('alert')).toBeNull();
	});

	it('moves focus to the next row after deleting a row', async () => {
		const held = heldFetch();
		renderView([note('n1', 'First note'), note('n2', 'Second note'), note('n3', 'Third note')]);

		await confirmDelete(await openDelete('Second note'));
		held.settle(0, true);

		await waitFor(() =>
			expect(document.activeElement).toBe(within(rowOf('Third note')).getByRole('button', { name: 'Restore' }))
		);
	});

	it('moves focus to the previous row after deleting the last row', async () => {
		const held = heldFetch();
		renderView([note('n1', 'First note'), note('n2', 'Second note')]);

		await confirmDelete(await openDelete('Second note'));
		held.settle(0, true);

		await waitFor(() =>
			expect(document.activeElement).toBe(within(rowOf('First note')).getByRole('button', { name: 'Restore' }))
		);
	});

	it('moves focus to the section heading after deleting the only row', async () => {
		const held = heldFetch();
		renderView([note('n1', 'Only note')]);

		await confirmDelete(await openDelete('Only note'));
		held.settle(0, true);

		await waitFor(() =>
			expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Archived leader notes' }))
		);
	});
});
