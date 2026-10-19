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

function stubFetch(respond: (url: string, init: RequestInit | undefined) => Response) {
	const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => respond(String(input), init));
	vi.stubGlobal('fetch', fetchMock);
	return fetchMock;
}

const rowFor = (title: string | RegExp) => screen.getByText(title).closest('li') as HTMLElement;

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

describe('PersonnelArchivedPageView', () => {
	it('counts the archived items and says who archived each and when', async () => {
		renderArchived();

		expect(await screen.findByText('3 archived items')).toBeTruthy();
		expect(screen.getByText('Archived 14 Oct · SFC Diaz')).toBeTruthy();
		expect(screen.getByText('Archived 16 Oct')).toBeTruthy();
	});

	it('narrows the list to one kind and back', async () => {
		renderArchived();
		await screen.findByText('3 archived items');

		await fireEvent.click(screen.getByRole('radio', { name: 'Notes' }));

		expect(screen.getByText('“Late to formation”')).toBeTruthy();
		expect(screen.queryByText('Dental readiness')).toBeNull();

		await fireEvent.click(screen.getByRole('radio', { name: 'All · 3' }));

		expect(screen.getByText('Dental readiness')).toBeTruthy();
	});

	it('keeps the chosen kind when its button is pressed again', async () => {
		renderArchived();
		await screen.findByText('3 archived items');
		await fireEvent.click(screen.getByRole('radio', { name: 'Notes' }));

		await fireEvent.click(screen.getByRole('radio', { name: 'Notes' }));

		expect(screen.getByText('“Late to formation”')).toBeTruthy();
		expect(screen.queryByText('Dental readiness')).toBeNull();
	});

	it('says so when a kind has nothing archived', async () => {
		renderArchived();
		await screen.findByText('3 archived items');

		await fireEvent.click(screen.getByRole('radio', { name: 'Counselings' }));

		expect(screen.getByText('Nothing archived in this category.')).toBeTruthy();
	});

	it('restores an item back to where it was and drops it from the list', async () => {
		const fetchMock = stubFetch(() => jsonResponse({}));
		renderArchived();
		await screen.findByText('3 archived items');

		await fireEvent.click(within(rowFor('Dental readiness')).getByRole('button', { name: 'Restore' }));

		await screen.findByText('2 archived items');
		expect(screen.queryByText('Dental readiness')).toBeNull();
		expect(String(fetchMock.mock.calls[0][0])).toBe('/org/org-1/api/personnel/person-1/follow-ups/f1');
		expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({ action: 'restore' });
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

	it('deletes only after the confirmation and names the stored file cleanup', async () => {
		const fetchMock = stubFetch(() => jsonResponse({ fileCleanup: 'pending' }));
		renderArchived();
		await screen.findByText('3 archived items');

		await fireEvent.click(within(rowFor('Profile')).getByRole('button', { name: 'Delete' }));
		expect(fetchMock).not.toHaveBeenCalled();

		const dialog = await screen.findByRole('alertdialog');
		await fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));

		await screen.findByText('2 archived items');
		expect(fetchMock.mock.calls[0][1]?.method).toBe('DELETE');
		expect(screen.getByText('Deleted Profile. Its stored file will be removed automatically.')).toBeTruthy();
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
