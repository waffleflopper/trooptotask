// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { specialDaysStore } from '$features/calendar/stores/specialDays.svelte';
import { toastStore } from '$lib/stores/toast.svelte';
import CalendarClosureSettingsSection from './CalendarClosureSettingsSection.svelte';

const closure = {
	id: 'closure-1',
	name: 'Training Holiday',
	date: '2026-12-03',
	type: 'org-closure' as const
};

describe('CalendarClosureSettingsSection save feedback', () => {
	beforeEach(() => {
		vi.useFakeTimers({ toFake: ['Date'] });
		vi.setSystemTime(new Date(2026, 9, 14, 12));
		specialDaysStore.load([{ ...closure }], 'org-1');
	});

	afterEach(() => {
		cleanup();
		vi.useRealTimers();
		specialDaysStore.load([], 'org-cleanup');
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	it.each([
		[404, 'That special day is no longer available.', 'That special day is no longer available.'],
		[500, 'Internal server error', 'Failed to save closure']
	])('keeps the edit open and shows the right reason for a %i', async (status, serverMessage, shown) => {
		vi.stubGlobal('fetch', async () => Response.json({ message: serverMessage }, { status }));
		const errorToast = vi.spyOn(toastStore, 'error').mockImplementation(() => 'toast-id');
		render(CalendarClosureSettingsSection, { props: { canMutate: true, searchQuery: '' } });

		await fireEvent.keyDown(screen.getByRole('button', { name: /^More actions for Training Holiday,/ }), {
			key: 'Enter'
		});
		await fireEvent.click(await screen.findByRole('menuitem', { name: 'Edit' }));
		await fireEvent.input(screen.getByLabelText('Name'), { target: { value: 'Unit Holiday' } });
		await fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

		await waitFor(() => expect(errorToast).toHaveBeenCalledWith(shown));
		expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe('Unit Holiday');
		expect(specialDaysStore.items).toEqual([closure]);
	});
});
