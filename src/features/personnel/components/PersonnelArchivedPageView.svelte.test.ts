// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PersonnelArchivedArtifact } from '../contracts';
import { jsonResponse, makeFollowUp, makeLeaderNote } from '../logFixtures.testHelper';
import PersonnelArchivedPageView from './PersonnelArchivedPageView.svelte';

vi.mock('$app/navigation', () => ({ invalidate: vi.fn().mockResolvedValue(undefined) }));

const records: PersonnelArchivedArtifact[] = [
	{
		kind: 'follow-up',
		...makeFollowUp({
			id: 'f1',
			title: 'Dental readiness',
			status: 'archived',
			archivedAt: '2026-10-14T12:00:00.000Z',
			archivedBy: 'SFC Diaz'
		})
	},
	{
		kind: 'note',
		...makeLeaderNote({ id: 'n1', text: 'Late to formation', archivedAt: '2026-10-16T12:00:00.000Z' })
	},
	{
		kind: 'document',
		id: 'd1',
		personnelId: 'person-1',
		title: 'Profile',
		fileName: 'profile.pdf',
		fileSizeBytes: 2048,
		contentType: 'application/pdf',
		uploadedBy: '1SG Ramos',
		createdAt: '2026-10-01T12:00:00.000Z',
		archivedAt: '2026-10-17T12:00:00.000Z'
	}
];

function renderArchived(archived: Promise<PersonnelArchivedArtifact[]> = Promise.resolve(records)) {
	return render(PersonnelArchivedPageView, { props: { orgId: 'org-1', personnelId: 'person-1', data: { archived } } });
}

function heldFetch() {
	const requests: Array<{ url: string; method: string | undefined }> = [];
	const settlers: Array<(response: Response) => void> = [];
	vi.stubGlobal(
		'fetch',
		vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
			requests.push({ url: String(input), method: init?.method });
			return new Promise<Response>((resolve) => settlers.push(resolve));
		})
	);
	return { requests, settle: (index: number, response: Response) => settlers[index](response) };
}

function stubFetch(respond: (url: string, init: RequestInit | undefined) => Response) {
	const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => respond(String(input), init));
	vi.stubGlobal('fetch', fetchMock);
	return fetchMock;
}

const rowFor = (title: string | RegExp) => screen.getByText(title).closest('li') as HTMLElement;

const threeNotes: PersonnelArchivedArtifact[] = ['First', 'Second', 'Third'].map((name, index) => ({
	kind: 'note',
	...makeLeaderNote({ id: `n${index + 1}`, text: `${name} note`, archivedAt: '2026-10-16T12:00:00.000Z' })
}));

async function confirmDeleteOf(title: string) {
	await fireEvent.click(within(rowFor(new RegExp(title))).getByRole('button', { name: 'Delete' }));
	const dialog = await screen.findByRole('alertdialog');
	await fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));
	return dialog;
}

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

describe('PersonnelArchivedPageView', () => {
	it('narrows the list to one kind and back', async () => {
		renderArchived();
		await screen.findByText('3 archived items');

		await fireEvent.click(screen.getByRole('radio', { name: 'Notes' }));

		expect(screen.getByText(/Late to formation/)).toBeTruthy();
		expect(screen.queryByText('Dental readiness')).toBeNull();

		await fireEvent.click(screen.getByRole('radio', { name: 'All · 3' }));

		expect(screen.getByText('Dental readiness')).toBeTruthy();
	});

	it('keeps the chosen kind when its button is pressed again', async () => {
		renderArchived();
		await screen.findByText('3 archived items');
		await fireEvent.click(screen.getByRole('radio', { name: 'Notes' }));

		await fireEvent.click(screen.getByRole('radio', { name: 'Notes' }));

		expect(screen.getByText(/Late to formation/)).toBeTruthy();
		expect(screen.queryByText('Dental readiness')).toBeNull();
	});

	it('keeps a restored item out of the list when the page receives a new data object holding the same load', async () => {
		stubFetch(() => jsonResponse({}));
		const archived = Promise.resolve(records);
		const view = render(PersonnelArchivedPageView, {
			props: { orgId: 'org-1', personnelId: 'person-1', data: { archived } }
		});
		await screen.findByText('3 archived items');
		await fireEvent.click(within(rowFor('Dental readiness')).getByRole('button', { name: 'Restore' }));
		await screen.findByText('2 archived items');

		await view.rerender({ orgId: 'org-1', personnelId: 'person-1', data: { archived } });

		expect(await screen.findByText('2 archived items')).toBeTruthy();
		expect(screen.queryByText('Dental readiness')).toBeNull();
	});

	it('keeps an item that failed to restore and says why', async () => {
		stubFetch(() => jsonResponse({ message: 'This item can no longer be restored.' }, 409));
		renderArchived();
		await screen.findByText('3 archived items');

		await fireEvent.click(within(rowFor('Dental readiness')).getByRole('button', { name: 'Restore' }));

		expect(await screen.findByText('This item can no longer be restored.')).toBeTruthy();
		expect(screen.getByText('3 archived items')).toBeTruthy();
	});

	it('deletes only after the confirmation and says the stored file is still to be removed', async () => {
		const fetchMock = stubFetch(() => jsonResponse({ fileCleanup: 'pending' }));
		renderArchived();
		await screen.findByText('3 archived items');

		await fireEvent.click(within(rowFor('Profile')).getByRole('button', { name: 'Delete' }));
		expect(fetchMock).not.toHaveBeenCalled();

		const dialog = await screen.findByRole('alertdialog');
		await fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));

		await screen.findByText('2 archived items');
		expect(fetchMock.mock.calls[0][1]?.method).toBe('DELETE');
		const notice = screen.getByRole('status');
		expect(notice.textContent).toContain('Profile');
		expect(notice.textContent).toContain('will be removed');
	});

	it('leaves the item alone when the confirmation is cancelled', async () => {
		const fetchMock = stubFetch(() => jsonResponse({}));
		renderArchived();
		await screen.findByText('3 archived items');

		await fireEvent.click(within(rowFor('Profile')).getByRole('button', { name: 'Delete' }));
		const dialog = await screen.findByRole('alertdialog');
		await fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));

		await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
		expect(fetchMock).not.toHaveBeenCalled();
		expect(screen.getByText('3 archived items')).toBeTruthy();
	});

	it('keeps the dialog open with the error when the delete fails', async () => {
		stubFetch(() => jsonResponse({ message: 'This item is locked by retention.' }, 409));
		renderArchived();
		await screen.findByText('3 archived items');

		await fireEvent.click(within(rowFor('Profile')).getByRole('button', { name: 'Delete' }));
		const dialog = await screen.findByRole('alertdialog');
		await fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));

		expect(await within(dialog).findByText('This item is locked by retention.')).toBeTruthy();
		expect(screen.getByText('3 archived items')).toBeTruthy();
	});

	it('reports a failed load', async () => {
		renderArchived(Promise.reject(new Error('read failed')));

		expect(await screen.findByText(/Archived items could not be loaded/)).toBeTruthy();
	});
});

describe('PersonnelArchivedPageView while a delete is in flight', () => {
	it('keeps the confirmation open and busy until the request settles, then closes it', async () => {
		const held = heldFetch();
		renderArchived(Promise.resolve(threeNotes));
		await screen.findByText('3 archived items');

		const dialog = await confirmDeleteOf('First note');
		await waitFor(() => expect(held.requests).toHaveLength(1));
		expect(held.requests[0]).toEqual({ url: '/org/org-1/api/personnel/person-1/leader-notes/n1', method: 'DELETE' });

		expect(dialog.getAttribute('aria-busy')).toBe('true');
		await fireEvent.keyDown(dialog, { key: 'Escape' });
		expect(screen.getByRole('alertdialog')).toBeTruthy();
		expect((within(dialog).getByRole('button', { name: 'Cancel' }) as HTMLButtonElement).disabled).toBe(true);

		held.settle(0, jsonResponse({}));
		await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
		expect(screen.queryByText(/First note/)).toBeNull();
	});

	it('keeps the confirmation open with the failure and retries the same delete', async () => {
		const held = heldFetch();
		renderArchived(Promise.resolve(threeNotes));
		await screen.findByText('3 archived items');

		const dialog = await confirmDeleteOf('First note');
		held.settle(0, jsonResponse({ message: 'Retention is holding this note.' }, 409));

		expect(await within(dialog).findByText('Retention is holding this note.')).toBeTruthy();
		expect(dialog.hasAttribute('aria-busy')).toBe(false);
		expect(within(screen.getByRole('list')).getByText(/First note/)).toBeTruthy();

		await fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));
		await waitFor(() => expect(held.requests).toHaveLength(2));
		expect(held.requests[1].url).toBe(held.requests[0].url);
		held.settle(1, jsonResponse({}));
		await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
		expect(screen.queryByText(/First note/)).toBeNull();
	});

	it('clears the failure when the confirmation is cancelled and reopened', async () => {
		const held = heldFetch();
		renderArchived(Promise.resolve(threeNotes));
		await screen.findByText('3 archived items');
		const dialog = await confirmDeleteOf('First note');
		held.settle(0, jsonResponse({ message: 'Retention is holding this note.' }, 409));
		await within(dialog).findByText('Retention is holding this note.');

		await fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
		await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
		await fireEvent.click(within(rowFor(/First note/)).getByRole('button', { name: 'Delete' }));

		expect(within(await screen.findByRole('alertdialog')).queryByText('Retention is holding this note.')).toBeNull();
	});
});

describe('PersonnelArchivedPageView focus after a delete', () => {
	it('moves to the next row, or the previous one after the last row', async () => {
		const held = heldFetch();
		renderArchived(Promise.resolve(threeNotes));
		await screen.findByText('3 archived items');

		await confirmDeleteOf('Second note');
		held.settle(0, jsonResponse({}));
		await waitFor(() =>
			expect(document.activeElement).toBe(within(rowFor(/Third note/)).getByRole('button', { name: 'Restore' }))
		);

		await confirmDeleteOf('Third note');
		held.settle(1, jsonResponse({}));
		await waitFor(() =>
			expect(document.activeElement).toBe(within(rowFor(/First note/)).getByRole('button', { name: 'Restore' }))
		);
	});

	it('moves to the section heading after deleting the only row', async () => {
		const held = heldFetch();
		renderArchived(Promise.resolve(threeNotes.slice(0, 1)));
		await screen.findByText('1 archived item');

		await confirmDeleteOf('First note');
		held.settle(0, jsonResponse({}));

		await waitFor(() => expect(document.activeElement).toBe(document.getElementById('archived-heading')));
	});
});
