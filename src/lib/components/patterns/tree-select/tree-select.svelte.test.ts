// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import TreeSelect from './tree-select.svelte';
import type { TreeSelectOption } from './treeSelectRows';

afterEach(cleanup);

const options: TreeSelectOption[] = [
	{ id: 'all', label: 'Everything', depth: 0, count: 20 },
	{ id: 'p1', label: 'North', depth: 0, count: 8 },
	{ id: 'p1-a', label: 'North A', depth: 1, count: 5 },
	{ id: 'p1-a-x', label: 'North A X', depth: 2, count: 2 },
	{ id: 'p1-b', label: 'North B', depth: 1, count: 3 },
	{ id: 'p2', label: 'South', depth: 0, count: 10 },
	{ id: 'p2-a', label: 'South A', depth: 1, count: 10 },
	{ id: 'none', label: 'Nobody', depth: 0, count: 0, disabled: true, aside: true }
];

function mount(value: string | null, list: TreeSelectOption[] = options) {
	const onValueChange = vi.fn();
	render(TreeSelect, {
		props: {
			options: list,
			value,
			onValueChange,
			label: 'Part',
			valueLabel: value ? (list.find((option) => option.id === value)?.label ?? null) : null,
			placeholder: 'Missing',
			searchPlaceholder: 'Find a part'
		}
	});
	return { onValueChange };
}

async function open() {
	await fireEvent.click(screen.getByRole('button', { name: /^Part:/ }));
	return screen.findByRole('combobox', { name: 'Find a part' });
}

const shown = () =>
	screen.getAllByRole('treeitem').map((item) => [item.id.split('-row-')[1], item.getAttribute('aria-expanded')]);
const activeRow = (field: HTMLElement) =>
	document.getElementById(field.getAttribute('aria-activedescendant') ?? '')?.id.split('-row-')[1];

describe('TreeSelect', () => {
	it('opens on the chosen node with its ancestors open and the rest collapsed', async () => {
		mount('p1-a');
		await open();

		expect(shown()).toEqual([
			['all', null],
			['p1', 'true'],
			['p1-a', 'true'],
			['p1-a-x', null],
			['p1-b', null],
			['p2', 'false'],
			['none', null]
		]);
		expect(screen.getAllByRole('treeitem', { selected: true }).map((item) => item.id.split('-row-')[1])).toEqual([
			'p1-a'
		]);
	});

	it('walks the tree from the keyboard and picks with Enter', async () => {
		const { onValueChange } = mount('p1');
		const field = await open();
		expect(activeRow(field)).toBe('p1');

		await fireEvent.keyDown(field, { key: 'ArrowLeft' });
		expect(shown().map(([id]) => id)).toEqual(['all', 'p1', 'p2', 'none']);
		await fireEvent.keyDown(field, { key: 'ArrowDown' });
		expect(activeRow(field)).toBe('p2');
		await fireEvent.keyDown(field, { key: 'ArrowRight' });
		expect(shown().map(([id]) => id)).toEqual(['all', 'p1', 'p2', 'p2-a', 'none']);
		await fireEvent.keyDown(field, { key: 'ArrowRight' });
		expect(activeRow(field)).toBe('p2-a');
		await fireEvent.keyDown(field, { key: 'ArrowLeft' });
		expect(activeRow(field)).toBe('p2');
		await fireEvent.keyDown(field, { key: 'ArrowDown' });
		await fireEvent.keyDown(field, { key: 'ArrowDown' });
		expect(activeRow(field)).toBe('p2-a');
		await fireEvent.keyDown(field, { key: 'Enter' });

		expect(onValueChange.mock.calls).toEqual([['p2-a']]);
		await waitFor(() => expect(screen.queryByRole('tree')).toBeNull());
	});

	it('finds a deep node by name, keeps its ancestors in view and picks the match with Enter', async () => {
		const { onValueChange } = mount('all');
		const field = await open();

		await fireEvent.input(field, { target: { value: 'a x' } });

		expect(shown()).toEqual([
			['p1', 'true'],
			['p1-a', 'true'],
			['p1-a-x', null]
		]);
		expect(activeRow(field)).toBe('p1-a-x');
		await fireEvent.keyDown(field, { key: 'Enter' });

		expect(onValueChange.mock.calls).toEqual([['p1-a-x']]);
	});

	it('skips a disabled node and will not pick it', async () => {
		const { onValueChange } = mount('p2-a');
		const field = await open();

		await fireEvent.keyDown(field, { key: 'ArrowDown' });
		expect(activeRow(field)).toBe('p2-a');
		await fireEvent.click(screen.getByRole('treeitem', { name: /Nobody/ }));

		expect(onValueChange).not.toHaveBeenCalled();
	});

	it('toggles several nodes from the keyboard and stays open, storing only the topmost', async () => {
		const stored: string[][] = [];
		const props = {
			multiple: true as const,
			options,
			value: ['p1-a'],
			onValueChange: (ids: string[]) => {
				stored.push(ids);
				void view.rerender({ ...props, value: ids });
			},
			label: 'Part',
			valueLabel: 'North A',
			placeholder: 'Any part',
			searchPlaceholder: 'Find a part'
		};
		const view = render(TreeSelect, { props });
		const field = await open();
		expect(screen.getByRole('tree').getAttribute('aria-multiselectable')).toBe('true');

		await fireEvent.keyDown(field, { key: 'ArrowLeft' });
		expect(activeRow(field)).toBe('p1');
		await fireEvent.keyDown(field, { key: 'Enter' });
		await fireEvent.keyDown(field, { key: 'ArrowDown' });
		expect(activeRow(field)).toBe('p2');
		await fireEvent.keyDown(field, { key: 'Enter' });
		await fireEvent.keyDown(field, { key: 'ArrowUp' });
		await fireEvent.keyDown(field, { key: 'Enter' });

		expect(stored).toEqual([['p1'], ['p1', 'p2'], ['p2']]);
		expect(screen.getByRole('tree')).toBeTruthy();
	});

	it('shows nodes under a chosen node as chosen and locked, and will not pick them', async () => {
		const onValueChange = vi.fn();
		render(TreeSelect, {
			props: {
				multiple: true,
				options,
				value: ['p1'],
				onValueChange,
				label: 'Part',
				valueLabel: 'North',
				placeholder: 'Any part',
				searchPlaceholder: 'Find a part'
			}
		});
		const field = await open();
		await fireEvent.input(field, { target: { value: 'north' } });

		const state = screen
			.getAllByRole('treeitem')
			.map((item) => [
				item.id.split('-row-')[1],
				item.getAttribute('aria-selected'),
				item.getAttribute('aria-disabled')
			]);
		expect(state).toEqual([
			['p1', 'true', null],
			['p1-a', 'true', 'true'],
			['p1-a-x', 'true', 'true'],
			['p1-b', 'true', 'true']
		]);
		await fireEvent.click(screen.getByRole('treeitem', { name: /North B/ }));
		await fireEvent.keyDown(field, { key: 'ArrowDown' });
		expect(activeRow(field)).toBe('p1');

		expect(onValueChange).not.toHaveBeenCalled();
	});

	it('shows a reader with one choice a label with nothing to open', () => {
		mount('only', [{ id: 'only', label: 'Lone', depth: 0, count: 4 }]);

		expect(screen.queryByRole('button')).toBeNull();
		expect(screen.getByText('Lone')).toBeTruthy();
	});
});
