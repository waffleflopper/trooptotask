// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import CalendarStatusSettingsSection from './CalendarStatusSettingsSection.svelte';
import { statusTypesStore } from '$features/calendar/stores/statusTypes.svelte';
import { toastStore } from '$lib/stores/toast.svelte';
import type { StatusType } from '$features/calendar/contracts';

const status = (id: string, name: string, sortOrder: number): StatusType => ({
	id,
	name,
	color: '#48bb78',
	textColor: '#ffffff',
	shortLabel: null,
	sortOrder
});
const leave = status('leave', 'Leave', 0);
const school = status('school', 'School', 1);
const sick = status('sick', 'Sick', 2);

const reply = (code: number, body: unknown) => ({
	ok: code >= 200 && code < 300,
	status: code,
	json: () => Promise.resolve(body),
	text: () => Promise.resolve(JSON.stringify(body))
});

const grip = (name: string) => screen.getByRole('button', { name: `Reorder ${name}` }) as HTMLButtonElement;
const shownOrder = () =>
	screen.getAllByRole('button', { name: /^Reorder / }).map((button) => button.getAttribute('aria-label'));

describe('Status order in Calendar settings', () => {
	beforeEach(() => {
		statusTypesStore.load([leave, school, sick], 'org-1');
		vi.spyOn(toastStore, 'error').mockImplementation(() => 'toast-id');
	});

	afterEach(() => {
		cleanup();
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	it('keeps the grip usable and focused while a save is held, then saves later moves in one follow-up', async () => {
		const puts: Array<{ body: unknown; answer: (value: unknown) => void }> = [];
		vi.stubGlobal(
			'fetch',
			vi.fn(
				(_url: string, init?: RequestInit) =>
					new Promise((answer) => puts.push({ body: JSON.parse(String(init?.body)), answer }))
			)
		);
		render(CalendarStatusSettingsSection, { props: { canMutate: true, searchQuery: '' } });
		grip('Leave').focus();

		await fireEvent.keyDown(grip('Leave'), { key: 'ArrowDown' });
		await fireEvent.keyDown(grip('Leave'), { key: 'ArrowDown' });

		expect(grip('Leave').disabled).toBe(false);
		expect(document.activeElement).toBe(grip('Leave'));
		expect(shownOrder()).toEqual(['Reorder School', 'Reorder Sick', 'Reorder Leave']);
		expect(puts.map(({ body }) => body)).toEqual([
			{ statusTypeIds: ['school', 'leave', 'sick'], expectedStatusTypeIds: ['leave', 'school', 'sick'] }
		]);

		puts[0].answer(reply(200, { success: true }));
		await waitFor(() => expect(puts).toHaveLength(2));
		expect(puts[1].body).toEqual({
			statusTypeIds: ['school', 'sick', 'leave'],
			expectedStatusTypeIds: ['school', 'leave', 'sick']
		});
		puts[1].answer(reply(200, { success: true }));
		await waitFor(() => expect(statusTypesStore.orderBusy).toBe(false));
		expect(statusTypesStore.items.map((type) => type.id)).toEqual(['school', 'sick', 'leave']);
	});

	it('announces where a row really is when its move is not saved', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn((_url: string, init?: RequestInit) =>
				Promise.resolve(
					init?.method === 'PUT' ? reply(409, { message: 'Not saved.' }) : reply(200, [leave, school, sick])
				)
			)
		);
		render(CalendarStatusSettingsSection, { props: { canMutate: true, searchQuery: '' } });

		await fireEvent.keyDown(grip('Leave'), { key: 'ArrowDown' });

		await waitFor(() => {
			const announcement = screen.getByRole('status').textContent ?? '';
			expect(announcement).toContain('Leave');
			expect(announcement).toMatch(/\b1\b/);
			expect(announcement).toMatch(/\b3\b/);
		});
		expect(shownOrder()).toEqual(['Reorder Leave', 'Reorder School', 'Reorder Sick']);
	});
});
