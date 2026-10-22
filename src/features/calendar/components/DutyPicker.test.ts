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
	{ kind: 'personnel', id: 'p-hale', prefix: 'SSG', label: 'Hale, Corey', current: false, count: 12, offRoster: false },
	{
		kind: 'personnel',
		id: 'p-liang',
		prefix: 'SPC',
		label: 'Liang, Wei',
		unavailable: 'Leave (A)',
		current: false,
		count: 11,
		offRoster: false
	},
	{
		kind: 'personnel',
		id: 'p-ortiz',
		prefix: 'SPC',
		label: 'Ortiz, Lucia',
		current: false,
		count: 3,
		offRoster: false
	},
	{ kind: 'personnel', id: 'p-moreno', prefix: '1SG', label: 'Moreno, Ana', current: false, offRoster: true }
];

function renderPicker(
	props: {
		assignTo?: 'personnel' | 'group';
		options?: DutyPickerOption[];
		onAssign?: (id: string) => Promise<boolean>;
		onClear?: () => Promise<boolean>;
		returnFocusTo?: () => HTMLElement | null;
	} = {}
) {
	const anchor = document.createElement('button');
	anchor.textContent = '+';
	document.body.append(anchor);
	const onAssign = vi.fn(props.onAssign ?? (async () => true));
	const onClear = props.onClear && vi.fn(props.onClear);
	const onClose = vi.fn(() => view.unmount());
	const view = render(DutyPicker, {
		props: {
			typeName: 'Staff Duty',
			assignTo: props.assignTo ?? 'personnel',
			date: new Date(2026, 9, 27),
			anchor,
			returnFocusTo: props.returnFocusTo,
			options: props.options ?? OPTIONS,
			onAssign,
			onClear,
			onClose
		}
	});
	return { anchor, onAssign, onClear, onClose };
}

describe('DutyPicker', () => {
	it('opens with focus in the search box and names an unavailable person with their status and dates', async () => {
		renderPicker();

		const search = await screen.findByRole('combobox', { name: 'Find person' });
		await waitFor(() => expect(document.activeElement).toBe(search));
		const liang = screen.getByRole('option', { name: /Liang, Wei/ });
		expect(liang.getAttribute('aria-label')).toMatch(/unavailable: Leave \(A\)/);
		expect(screen.getByRole('option', { name: /^SSG Hale, Corey/ })).toBeTruthy();
	});

	it("lists the roster with each person's count, and finds someone off the roster only by name", async () => {
		renderPicker();

		const search = await screen.findByRole('combobox', { name: 'Find person' });
		expect(screen.getAllByRole('option').map((option) => option.getAttribute('aria-label'))).toEqual([
			'SSG Hale, Corey, count 12',
			'SPC Liang, Wei, count 11, unavailable: Leave (A)',
			'SPC Ortiz, Lucia, count 3'
		]);

		await fireEvent.input(search, { target: { value: 'moreno' } });
		const moreno = await screen.findByRole('option', { name: /Moreno, Ana/ });
		expect(moreno.getAttribute('aria-label')).toBe('1SG Moreno, Ana, not on this roster');
		expect(moreno.textContent).toContain('Not on this roster');
	});

	it('filters by typed text and assigns the chosen person with Enter', async () => {
		const { onAssign } = renderPicker();

		const search = await screen.findByRole('combobox', { name: 'Find person' });
		await fireEvent.input(search, { target: { value: 'ortiz' } });
		await waitFor(() => expect(screen.queryByRole('option', { name: /Hale/ })).toBeNull());
		expect(screen.getByRole('option', { name: /Ortiz, Lucia/ })).toBeTruthy();
		await fireEvent.keyDown(search, { key: 'Enter' });

		await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
		expect(onAssign).toHaveBeenCalledWith('p-ortiz');
	});

	it('lists matches in the roster order, not by where the text matches, and Enter assigns the first', async () => {
		const person = (id: string, label: string): DutyPickerOption => ({
			kind: 'personnel',
			id,
			prefix: 'SPC',
			label,
			current: false,
			offRoster: false
		});
		const { onAssign } = renderPicker({
			options: [person('p-cabot', 'Cabot, Dee'), person('p-young', 'Young, Dee'), person('p-abbott', 'Abbott, Cal')]
		});

		const search = await screen.findByRole('combobox', { name: 'Find person' });
		await fireEvent.input(search, { target: { value: 'ab' } });
		await waitFor(() => expect(screen.queryByRole('option', { name: /Young/ })).toBeNull());
		expect(screen.getAllByRole('option').map((option) => option.getAttribute('aria-label'))).toEqual([
			expect.stringContaining('Cabot'),
			expect.stringContaining('Abbott')
		]);
		await fireEvent.keyDown(search, { key: 'Enter' });

		expect(onAssign).toHaveBeenCalledWith('p-cabot');
	});

	it('searches Groups for a Group duty', async () => {
		const { onAssign } = renderPicker({
			assignTo: 'group',
			options: [
				{ kind: 'group', id: 'g-alpha', label: 'Alpha', current: false },
				{ kind: 'group', id: 'g-bravo', label: 'Bravo', current: false }
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

		await fireEvent.click(await screen.findByRole('option', { name: /Liang, Wei, count 11, unavailable/ }));

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

	it('stays open after a failed save and saves on the next try', async () => {
		const { onAssign, onClose } = renderPicker({
			onAssign: vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true)
		});

		await fireEvent.click(await screen.findByRole('option', { name: /Ortiz, Lucia/ }));
		await waitFor(() => expect(onAssign).toHaveBeenCalledTimes(1));
		await waitFor(() => expect(screen.getByRole('listbox').getAttribute('aria-busy')).toBe('false'));
		expect(onClose).not.toHaveBeenCalled();
		expect(screen.getByRole('dialog')).toBeTruthy();

		await fireEvent.click(screen.getByRole('option', { name: /Ortiz, Lucia/ }));
		await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
		expect(onAssign).toHaveBeenCalledTimes(2);
	});

	it('ignores a second choice while a save is still pending', async () => {
		let settle!: (saved: boolean) => void;
		const { onAssign } = renderPicker({ onAssign: () => new Promise<boolean>((resolve) => (settle = resolve)) });

		await fireEvent.click(await screen.findByRole('option', { name: /Ortiz, Lucia/ }));
		await fireEvent.click(screen.getByRole('option', { name: /Hale, Corey/ }));
		expect(onAssign).toHaveBeenCalledTimes(1);
		settle(true);

		await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
	});

	it('offers Clear assignment only when the caller can clear, and closes after it succeeds', async () => {
		const withoutClear = renderPicker();
		await screen.findByRole('dialog');
		expect(screen.queryByRole('button', { name: 'Clear assignment' })).toBeNull();
		withoutClear.onClose();
		cleanup();

		const { onClear } = renderPicker({ onClear: async () => true });
		await fireEvent.click(await screen.findByRole('button', { name: 'Clear assignment' }));

		await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
		expect(onClear).toHaveBeenCalledTimes(1);
	});

	it('says so when a search matches no one', async () => {
		renderPicker();

		await fireEvent.input(await screen.findByRole('combobox', { name: 'Find person' }), { target: { value: 'zzz' } });

		expect(await screen.findByText('No one matches.')).toBeTruthy();
	});
});
