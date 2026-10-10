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
});
