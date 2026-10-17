// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import DutyPicker from './DutyPicker.svelte';
import type { DutyPickerOption } from '$features/calendar/utils/dutyPickerOptions';

vi.mock('$lib/utils/browserStorage', () => ({ getBrowserLocalStorage: () => window.localStorage }));

afterEach(() => {
	cleanup();
	window.localStorage.clear();
	document.body.innerHTML = '';
});

const OPTIONS: DutyPickerOption[] = [
	{
		kind: 'personnel',
		id: 'p-hale',
		prefix: 'SSG',
		role: 'Medic',
		mos: '68W',
		label: 'Hale, Corey',
		current: false,
		lastDuty: { kind: 'none' }
	},
	{
		kind: 'personnel',
		id: 'p-liang',
		prefix: 'SPC',
		role: 'Medic',
		mos: '68W',
		label: 'Liang, Wei',
		unavailable: 'Leave 26 Oct – 3 Nov',
		current: false,
		lastDuty: { kind: 'previous', date: '2026-09-16', daysSince: 41 }
	},
	{
		kind: 'personnel',
		id: 'p-ortiz',
		prefix: 'SPC',
		role: 'Driver',
		mos: '88M',
		label: 'Ortiz, Lucia',
		current: false,
		lastDuty: { kind: 'previous', date: '2026-10-26', daysSince: 1 }
	}
];

function renderPicker(
	props: {
		typeId?: string;
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
			typeId: props.typeId ?? 'type-staff-duty',
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
		expect(liang.getAttribute('aria-label')).toMatch(/unavailable: Leave 26 Oct – 3 Nov/);
		expect(screen.getByRole('option', { name: /^SSG Hale, Corey/ })).toBeTruthy();
	});

	it('gives each person a last-duty figure, including none in the window', async () => {
		renderPicker();

		expect((await screen.findByRole('option', { name: /Liang, Wei/ })).getAttribute('aria-label')).toContain('41');
		expect(screen.getByRole('option', { name: /Hale, Corey/ }).getAttribute('aria-label')).toContain('90');
		expect(screen.getByText('41d')).toBeTruthy();
		expect(screen.getByText('none in 90d')).toBeTruthy();
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

	it('lists matches in the prepared duty order, not by where the text matches, and Enter assigns the first', async () => {
		const person = (id: string, label: string): DutyPickerOption => ({
			kind: 'personnel',
			id,
			prefix: 'SPC',
			role: '',
			mos: '',
			label,
			current: false,
			lastDuty: { kind: 'none' }
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

	describe('filters', () => {
		const optionNames = () =>
			screen
				.getAllByRole('option')
				.map((option) => option.getAttribute('aria-label')?.split(',').slice(0, 2).join(','));

		async function choose(facet: string, value: string) {
			const trigger = await screen.findByRole('button', { name: new RegExp(`^Filter by ${facet}`) });
			await fireEvent.keyDown(trigger, { key: 'Enter' });
			await fireEvent.click(await screen.findByRole('menuitemcheckbox', { name: value }));
		}

		it('narrows the list to the chosen rank and keeps the menu open for more choices', async () => {
			renderPicker();

			await choose('Rank', 'SPC');

			await waitFor(() => expect(optionNames()).toEqual(['SPC Liang, Wei', 'SPC Ortiz, Lucia']));
			expect(screen.getByRole('menuitemcheckbox', { name: 'SPC' }).getAttribute('aria-checked')).toBe('true');
			expect(screen.getByRole('menuitemcheckbox', { name: 'SSG' }).getAttribute('aria-checked')).toBe('false');
			expect(screen.getByRole('button', { name: 'Filter by Rank, 1 selected' }).textContent).toContain('Rank · 1');
		});

		it('combines facets and says so when nobody is left', async () => {
			renderPicker();

			await choose('Rank', 'SSG');
			await choose('Role', 'Driver');

			expect(await screen.findByText('No one matches these filters.')).toBeTruthy();
			expect(screen.queryAllByRole('option')).toEqual([]);
		});

		it('keeps the text search for a miss distinct from the filter message', async () => {
			renderPicker();

			await fireEvent.input(await screen.findByRole('combobox', { name: 'Find person' }), { target: { value: 'zzz' } });

			expect(await screen.findByText('No one matches.')).toBeTruthy();
		});

		it('clears every filter at once', async () => {
			renderPicker();
			await choose('Rank', 'SPC');
			await waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(2));

			await fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
			await fireEvent.click(await screen.findByRole('button', { name: 'Clear filters' }));

			await waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(3));
			expect(screen.queryByRole('button', { name: 'Clear filters' })).toBeNull();
		});

		it('remembers the choice for the same assignment type and not for another', async () => {
			const first = renderPicker({ typeId: 'type-a' });
			await choose('Rank', 'SPC');
			await waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(2));
			first.onClose();
			cleanup();

			renderPicker({ typeId: 'type-a' });
			await screen.findByRole('dialog');
			expect(optionNames()).toEqual(['SPC Liang, Wei', 'SPC Ortiz, Lucia']);
			expect(screen.getByRole('button', { name: 'Filter by Rank, 1 selected' }).textContent).toContain('Rank · 1');
			cleanup();

			renderPicker({ typeId: 'type-b' });
			await screen.findByRole('dialog');
			expect(screen.getAllByRole('option')).toHaveLength(3);
		});

		it('keeps the picker open when a filter choice is pressed, since the menu is drawn outside it', async () => {
			const { onClose } = renderPicker();
			const trigger = await screen.findByRole('button', { name: 'Filter by Rank' });
			await fireEvent.keyDown(trigger, { key: 'Enter' });

			const item = await screen.findByRole('menuitemcheckbox', { name: 'SPC' });
			await fireEvent.pointerDown(item);
			await fireEvent.pointerUp(item);
			await fireEvent.click(item);

			await waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(2));
			expect(onClose).not.toHaveBeenCalled();
		});

		it('offers no filters for a Group duty', async () => {
			renderPicker({ assignTo: 'group', options: [{ kind: 'group', id: 'g-alpha', label: 'Alpha', current: false }] });

			await screen.findByRole('dialog');
			expect(screen.queryByRole('button', { name: /^Filter by/ })).toBeNull();
		});

		it('closes only the filter menu on Escape, leaving the picker open', async () => {
			const { onClose } = renderPicker();
			const trigger = await screen.findByRole('button', { name: 'Filter by Rank' });
			await fireEvent.keyDown(trigger, { key: 'Enter' });
			await screen.findByRole('menu');

			await fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });

			await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
			expect(onClose).not.toHaveBeenCalled();
			expect(screen.getByRole('dialog')).toBeTruthy();
		});
	});
});
