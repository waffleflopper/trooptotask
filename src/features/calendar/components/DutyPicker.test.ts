// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import DutyPicker from './DutyPicker.svelte';
import { dutyPickerOptions } from '$features/calendar/utils/dutyPickerOptions';
import type { Personnel } from '$features/personnel/contracts';

afterEach(() => {
	cleanup();
	document.body.innerHTML = '';
});

function person(id: string, rank: string, lastName: string, firstName: string): Personnel {
	return { id, rank, lastName, firstName, mos: '', clinicRole: '', groupId: null, groupName: '' };
}

function renderPicker() {
	const anchor = document.createElement('button');
	anchor.textContent = '+';
	document.body.append(anchor);
	const onAssign = vi.fn();
	const onClose = vi.fn();
	const options = dutyPickerOptions({
		type: {
			id: 'sd',
			name: 'Staff Duty',
			shortName: 'SD',
			assignTo: 'personnel',
			color: '#b91c1c',
			exemptPersonnelIds: ['p-kim'],
			showOnCalendar: true,
			sortOrder: 0
		},
		dateKey: '2026-10-27',
		personnel: [
			person('p-ortiz', 'SPC', 'Ortiz', 'Lucia'),
			person('p-kim', 'SGT', 'Kim', 'Jae-won'),
			person('p-liang', 'SPC', 'Liang', 'Wei'),
			person('p-hale', 'SSG', 'Hale', 'Corey')
		],
		groups: [],
		availabilityEntries: [
			{ id: 'e-1', personnelId: 'p-liang', statusTypeId: 'leave', startDate: '2026-10-26', endDate: '2026-11-03' }
		],
		statusTypes: [{ id: 'leave', name: 'Leave', color: '#16a34a', textColor: '#fff' }]
	});
	render(DutyPicker, {
		props: { typeName: 'Staff Duty', date: new Date(2026, 9, 27), anchor, options, onAssign, onClose }
	});
	return { anchor, onAssign, onClose };
}

describe('DutyPicker', () => {
	it('opens with focus in the search box and lists eligible people by name', async () => {
		renderPicker();

		const search = await screen.findByRole('combobox', { name: 'Find person' });
		await waitFor(() => expect(document.activeElement).toBe(search));
		expect(screen.getByRole('dialog', { name: 'Staff Duty, Tue 27 Oct' })).toBeTruthy();
		expect(screen.getAllByRole('option').map((option) => option.getAttribute('aria-label'))).toEqual([
			'SSG Hale, Corey',
			'SPC Liang, Wei, unavailable: Leave 26 Oct – 3 Nov',
			'SPC Ortiz, Lucia'
		]);
	});

	it('filters by typed text and assigns the chosen person with Enter', async () => {
		const { onAssign, onClose } = renderPicker();

		const search = await screen.findByRole('combobox', { name: 'Find person' });
		await fireEvent.input(search, { target: { value: 'ortiz' } });
		await waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(1));
		await fireEvent.keyDown(search, { key: 'Enter' });

		expect(onAssign).toHaveBeenCalledWith('p-ortiz');
		expect(onClose).toHaveBeenCalledTimes(1);
	});

	it('assigns an unavailable person, since the commander decides', async () => {
		const { onAssign } = renderPicker();

		await fireEvent.click(
			await screen.findByRole('option', { name: 'SPC Liang, Wei, unavailable: Leave 26 Oct – 3 Nov' })
		);

		expect(onAssign).toHaveBeenCalledWith('p-liang');
	});

	it('closes on Escape and returns focus to the open day', async () => {
		const { anchor, onClose } = renderPicker();

		const search = await screen.findByRole('combobox', { name: 'Find person' });
		await waitFor(() => expect(document.activeElement).toBe(search));
		await fireEvent.keyDown(search, { key: 'Escape' });

		expect(onClose).toHaveBeenCalledTimes(1);
		await waitFor(() => expect(document.activeElement).toBe(anchor));
	});
});
