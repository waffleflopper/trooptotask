// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { statusTypesStore } from '$features/calendar/stores/statusTypes.svelte';
import { toastStore } from '$lib/stores/toast.svelte';
import CalendarStatusSettingsSection from './CalendarStatusSettingsSection.svelte';

const leave = { id: 'status-leave', name: 'Leave', color: '#2563eb', textColor: '#ffffff' };

describe('CalendarStatusSettingsSection save feedback', () => {
	beforeEach(() => statusTypesStore.load([{ ...leave }], 'org-1'));

	afterEach(() => {
		cleanup();
		statusTypesStore.load([], 'org-cleanup');
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	it.each([
		[409, 'A status type with that name already exists.', 'A status type with that name already exists.'],
		[500, 'Internal server error', 'Failed to save status type']
	])('keeps the edit open and shows the right reason for a %i', async (status, serverMessage, shown) => {
		vi.stubGlobal('fetch', async () => Response.json({ message: serverMessage }, { status }));
		const errorToast = vi.spyOn(toastStore, 'error').mockImplementation(() => 'toast-id');
		render(CalendarStatusSettingsSection, { props: { canMutate: true, searchQuery: '' } });

		await fireEvent.click(screen.getByRole('button', { name: 'Edit Leave' }));
		await fireEvent.input(screen.getByLabelText('Status name'), { target: { value: 'Annual Leave' } });
		await fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

		await waitFor(() => expect(errorToast).toHaveBeenCalledWith(shown));
		expect((screen.getByLabelText('Status name') as HTMLInputElement).value).toBe('Annual Leave');
		expect(statusTypesStore.items).toEqual([leave]);
	});
});
