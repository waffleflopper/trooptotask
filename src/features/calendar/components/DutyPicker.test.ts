// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import DutyPicker from './DutyPicker.svelte';
import type { DutyPickerOption } from '$features/calendar/utils/dutyPickerOptions';

afterEach(() => {
	cleanup();
	document.body.innerHTML = '';
});

const OPTIONS: DutyPickerOption[] = [
	{ id: 'p-hale', prefix: 'SSG', label: 'Hale, Corey', current: false },
	{ id: 'p-liang', prefix: 'SPC', label: 'Liang, Wei', unavailable: 'Leave 26 Oct – 3 Nov', current: false },
	{ id: 'p-ortiz', prefix: 'SPC', label: 'Ortiz, Lucia', current: false }
];

function renderPicker(props: { assignTo?: 'personnel' | 'group'; options?: DutyPickerOption[] } = {}) {
	const anchor = document.createElement('button');
	anchor.textContent = '+';
	document.body.append(anchor);
	const onAssign = vi.fn();
	const onClose = vi.fn(() => view.unmount());
	const view = render(DutyPicker, {
		props: {
			typeName: 'Staff Duty',
			assignTo: props.assignTo ?? 'personnel',
			date: new Date(2026, 9, 27),
			anchor,
			options: props.options ?? OPTIONS,
			onAssign,
			onClose
		}
	});
	return { anchor, onAssign, onClose };
}

describe('DutyPicker', () => {
	it('opens with focus in the search box and names an unavailable person with their status and dates', async () => {
		renderPicker();

		const search = await screen.findByRole('combobox', { name: 'Find person' });
		await waitFor(() => expect(document.activeElement).toBe(search));
		const liang = screen.getByRole('option', { name: /Liang, Wei/ });
		expect(liang.getAttribute('aria-label')).toMatch(/unavailable: Leave 26 Oct – 3 Nov/);
	});

	it('filters by typed text and assigns the chosen person with Enter', async () => {
		const { onAssign } = renderPicker();

		const search = await screen.findByRole('combobox', { name: 'Find person' });
		await fireEvent.input(search, { target: { value: 'ortiz' } });
		await waitFor(() => expect(screen.queryByRole('option', { name: /Hale/ })).toBeNull());
		expect(screen.getByRole('option', { name: /Ortiz, Lucia/ })).toBeTruthy();
		await fireEvent.keyDown(search, { key: 'Enter' });

		expect(onAssign).toHaveBeenCalledWith('p-ortiz');
		expect(screen.queryByRole('dialog')).toBeNull();
	});

	it('searches Groups for a Group duty', async () => {
		const { onAssign } = renderPicker({
			assignTo: 'group',
			options: [
				{ id: 'g-alpha', label: 'Alpha', current: false },
				{ id: 'g-bravo', label: 'Bravo', current: false }
			]
		});

		const search = await screen.findByRole('combobox', { name: 'Find group' });
		await fireEvent.input(search, { target: { value: 'bra' } });
		await waitFor(() => expect(screen.queryByRole('option', { name: 'Alpha' })).toBeNull());
		await fireEvent.keyDown(search, { key: 'Enter' });

		expect(onAssign).toHaveBeenCalledWith('g-bravo');
	});

	it('assigns an unavailable person, since the commander decides', async () => {
		const { onAssign } = renderPicker();

		await fireEvent.click(await screen.findByRole('option', { name: /Liang, Wei, unavailable/ }));

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
