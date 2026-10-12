// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { writable } from 'svelte/store';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SettingsArchivesSectionData } from '../settingsSectionTypes';

const { invalidateAllMock, toastError } = vi.hoisted(() => ({
	invalidateAllMock: vi.fn(),
	toastError: vi.fn()
}));

vi.mock('$app/navigation', () => ({ invalidateAll: invalidateAllMock }));
vi.mock('$app/stores', () => ({ page: writable({ params: { orgId: 'org-1' } }) }));
vi.mock('$lib/stores/toast.svelte', () => ({
	toastStore: { success: vi.fn(), error: toastError }
}));

import Page from './+page.svelte';

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
	invalidateAllMock.mockReset();
	toastError.mockReset();
});

const archivesSettings: SettingsArchivesSectionData = {
	rows: [
		{
			id: 'person-1',
			rank: 'SGT',
			firstName: 'Monica',
			lastName: 'Rivera',
			mos: '68W',
			groupName: 'Alpha',
			archivedAt: '2026-05-01T00:00:00.000Z',
			groupId: 'group-1',
			displayName: 'SGT Rivera, Monica',
			exportFileStem: 'rivera-monica'
		}
	],
	retention: { months: 12, purgeSummary: 'Records purge after 12 months.' },
	commands: { canRestore: true, canExport: true, canPermanentlyDelete: true }
};

describe('Archived personnel permanent delete', () => {
	it('keeps the typed name when the delete is rejected', async () => {
		const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 500 }));
		vi.stubGlobal('fetch', fetchMock);
		render(Page, {
			props: { data: { archivesSettings: { sections: { archivedPersonnel: archivesSettings } } } } as never
		});

		await fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
		const confirmation = (await screen.findByLabelText('Type the name to confirm')) as HTMLInputElement;
		await fireEvent.input(confirmation, { target: { value: 'SGT Rivera, Monica' } });
		await fireEvent.click(screen.getByRole('button', { name: 'Permanently Delete' }));

		await waitFor(() => expect(toastError).toHaveBeenCalledWith('Failed to permanently delete'));
		expect(fetchMock).toHaveBeenCalledWith('/org/org-1/api/personnel/permanent', {
			method: 'DELETE',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ id: 'person-1' })
		});
		expect((screen.getByLabelText('Type the name to confirm') as HTMLInputElement).value).toBe('SGT Rivera, Monica');
		expect(invalidateAllMock).not.toHaveBeenCalled();
	});
	it.each([
		{ remaining: 0, focused: () => screen.getByRole('heading', { name: 'Archived Records' }) },
		{ remaining: 1, focused: () => screen.getAllByRole('button', { name: 'Restore' })[0] }
	])('moves focus to a stable target after deleting a row leaves $remaining rows', async ({ remaining, focused }) => {
		const second = { ...archivesSettings.rows[0], id: 'person-2', lastName: 'Chen', firstName: 'Lee' };
		const dataWith = (rows: typeof archivesSettings.rows) =>
			({ archivesSettings: { sections: { archivedPersonnel: { ...archivesSettings, rows } } } }) as never;
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 200 })));
		const view = render(Page, {
			props: { data: dataWith(remaining === 0 ? archivesSettings.rows : [archivesSettings.rows[0], second]) }
		});
		invalidateAllMock.mockImplementation(() => view.rerender({ data: dataWith(remaining === 0 ? [] : [second]) }));

		await fireEvent.click(screen.getAllByRole('button', { name: 'Delete' })[0]);
		const confirmation = (await screen.findByLabelText('Type the name to confirm')) as HTMLInputElement;
		await fireEvent.input(confirmation, { target: { value: 'SGT Rivera, Monica' } });
		await fireEvent.click(screen.getByRole('button', { name: 'Permanently Delete' }));

		await waitFor(() => expect(document.activeElement).toBe(focused()));
	});

	it('holds the other actions of a row while its Restore is in flight', async () => {
		let respond!: (response: Response) => void;
		vi.stubGlobal(
			'fetch',
			vi.fn(() => new Promise<Response>((resolve) => (respond = resolve)))
		);
		render(Page, {
			props: { data: { archivesSettings: { sections: { archivedPersonnel: archivesSettings } } } } as never
		});

		await fireEvent.click(screen.getByRole('button', { name: 'Restore' }));

		for (const name of [/Restore/, /Export/, /Delete/]) {
			expect((screen.getByRole('button', { name }) as HTMLButtonElement).disabled).toBe(true);
		}
		await fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
		expect(screen.queryByRole('dialog')).toBeNull();

		respond(new Response(null, { status: 500 }));
		await waitFor(() =>
			expect((screen.getByRole('button', { name: 'Delete' }) as HTMLButtonElement).disabled).toBe(false)
		);
		expect((screen.getByRole('button', { name: 'Export' }) as HTMLButtonElement).disabled).toBe(false);
	});
});
