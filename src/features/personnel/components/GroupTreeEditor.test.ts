// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import type { ComponentProps } from 'svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Group } from '$features/personnel/contracts';
import GroupTreeEditor from './GroupTreeEditor.svelte';

const group = (id: string, name: string, sortOrder: number, parentId: string | null, depth: 1 | 2 | 3): Group => ({
	id,
	name,
	sortOrder,
	parentId,
	depth
});

const groups: Group[] = [
	group('plt1', '1st Platoon', 0, null, 1),
	group('sq1', '1st Squad', 0, 'plt1', 2),
	group('alpha', 'Alpha Team', 0, 'sq1', 3),
	group('bravo', 'Bravo Team', 1, 'sq1', 3),
	group('sq2', '2nd Squad', 1, 'plt1', 2),
	group('hq', 'HQ', 1, null, 1)
];

const people = [
	...['sq1', 'sq1', 'alpha', 'alpha', 'alpha', 'bravo', 'sq2', 'hq'].map((groupId) => ({ groupId })),
	{ groupId: null }
];

function renderTree(overrides: Partial<ComponentProps<typeof GroupTreeEditor>> = {}) {
	const commands = {
		add: vi.fn(async (name: string, parentId: string | null) => group(`${parentId}/${name}`, name, 9, parentId, 1)),
		rename: vi.fn(async () => {}),
		move: vi.fn(async () => {}),
		reorder: vi.fn(async () => ({ status: 'saved' as const })),
		remove: vi.fn(async () => {})
	};
	render(GroupTreeEditor, { props: { groups, people, commands, ...overrides } });
	return commands;
}

async function openMenu(name: string) {
	await fireEvent.pointerDown(screen.getByRole('button', { name: `Change ${name}` }), {
		button: 0,
		pointerType: 'mouse'
	});
	return screen.findByRole('menu');
}

async function choose(name: string, item: string) {
	const menu = await openMenu(name);
	await fireEvent.click(within(menu).getByRole('menuitem', { name: item }));
	return screen.findByRole('alertdialog');
}

const shownOptions = () =>
	screen
		.getAllByRole('treeitem')
		.map((item) => [item.id.split('-row-')[1], item.getAttribute('aria-disabled') === 'true']);

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
});

describe('GroupTreeEditor', () => {
	it('offers sub-group creation only above the depth limit', () => {
		renderTree();

		expect(screen.getByRole('button', { name: 'Add a sub-group to 1st Squad' })).toBeTruthy();
		expect(screen.queryByRole('button', { name: 'Add a sub-group to Alpha Team' })).toBeNull();
	});

	it('adds sub-groups one after another under the chosen parent', async () => {
		const commands = renderTree();

		await fireEvent.click(screen.getByRole('button', { name: 'Add a sub-group to 1st Squad' }));
		const field = screen.getByRole('textbox', { name: 'New sub-group in 1st Squad' }) as HTMLInputElement;
		await fireEvent.input(field, { target: { value: ' Charlie Team ' } });
		await fireEvent.keyDown(field, { key: 'Enter' });
		await waitFor(() => expect(field.value).toBe(''));
		await fireEvent.input(field, { target: { value: 'Delta Team' } });
		await fireEvent.keyDown(field, { key: 'Enter' });

		await waitFor(() =>
			expect(commands.add.mock.calls).toEqual([
				['Charlie Team', 'sq1'],
				['Delta Team', 'sq1']
			])
		);
	});

	it('adds a top-level Group from the name field', async () => {
		const commands = renderTree();
		const field = screen.getByRole('textbox', { name: 'New group name' });

		await fireEvent.input(field, { target: { value: 'Maintenance' } });
		await fireEvent.keyDown(field, { key: 'Enter' });

		await waitFor(() => expect(commands.add.mock.calls).toEqual([['Maintenance', null]]));
	});

	it('reorders only within one sibling set and names its parent', async () => {
		const commands = renderTree();

		await fireEvent.keyDown(screen.getByRole('button', { name: 'Reorder Bravo Team' }), { key: 'ArrowUp' });
		await fireEvent.keyDown(screen.getByRole('button', { name: 'Reorder HQ' }), { key: 'ArrowUp' });

		await waitFor(() =>
			expect(commands.reorder.mock.calls).toEqual([
				[['bravo', 'alpha'], 'sq1'],
				[['hq', 'plt1'], null]
			])
		);
	});

	it('shows a failed order under the sibling set it belongs to', async () => {
		const commands = renderTree();
		commands.reorder.mockResolvedValueOnce({ status: 'failed', message: 'Order failed.' } as never);

		await fireEvent.keyDown(screen.getByRole('button', { name: 'Reorder 2nd Squad' }), { key: 'ArrowUp' });

		const alert = await screen.findByRole('alert');
		expect(alert.textContent?.trim()).toBe('Order failed.');
		expect(alert.closest('[data-reorder-id]')?.getAttribute('data-reorder-id')).toBe('plt1');
	});

	it('renames a Group in place', async () => {
		const commands = renderTree();

		const menu = await openMenu('2nd Squad');
		await fireEvent.click(within(menu).getByRole('menuitem', { name: 'Rename' }));
		const field = await screen.findByRole('textbox', { name: 'Group name' });
		await fireEvent.input(field, { target: { value: 'Weapons Squad' } });
		await fireEvent.keyDown(field, { key: 'Enter' });

		await waitFor(() => expect(commands.rename.mock.calls).toEqual([['sq2', 'Weapons Squad']]));
		await waitFor(() => expect(screen.queryByRole('textbox', { name: 'Group name' })).toBeNull());
	});

	it('moves a squad under another Group, ruling out its parent and its own subtree', async () => {
		const commands = renderTree();

		const dialog = await choose('1st Squad', 'Move under…');
		await fireEvent.click(within(dialog).getByRole('button', { name: /^Move under:/ }));
		await screen.findByRole('combobox', { name: 'Search Groups' });

		expect(shownOptions()).toEqual([
			['top-level', false],
			['plt1', true],
			['hq', false]
		]);
		await fireEvent.click(screen.getAllByRole('treeitem')[2]);
		await fireEvent.click(within(dialog).getByRole('button', { name: 'Move' }));

		await waitFor(() => expect(commands.move.mock.calls).toEqual([['sq1', 'hq']]));
	});

	it('moves a team to the top level', async () => {
		const commands = renderTree();

		const dialog = await choose('Alpha Team', 'Move under…');
		await fireEvent.click(within(dialog).getByRole('button', { name: /^Move under:/ }));
		await screen.findByRole('combobox', { name: 'Search Groups' });
		await fireEvent.click(screen.getAllByRole('treeitem')[0]);
		await fireEvent.click(within(dialog).getByRole('button', { name: 'Move' }));

		await waitFor(() => expect(commands.move.mock.calls).toEqual([['alpha', null]]));
	});

	it('adds standard squads with two teams each under a platoon', async () => {
		const commands = renderTree();

		const dialog = await choose('HQ', 'Add standard squads…');
		await fireEvent.change(within(dialog).getByRole('combobox', { name: 'Squads' }), { target: { value: '2' } });
		await fireEvent.click(within(dialog).getByRole('button', { name: 'Add 2 squads' }));

		await waitFor(() =>
			expect(commands.add.mock.calls).toEqual([
				['1st Squad', 'hq'],
				['Alpha Team', 'hq/1st Squad'],
				['Bravo Team', 'hq/1st Squad'],
				['2nd Squad', 'hq'],
				['Alpha Team', 'hq/2nd Squad'],
				['Bravo Team', 'hq/2nd Squad']
			])
		);
		await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
	});

	it('offers standard squads only on top-level Groups', async () => {
		renderTree();

		const menu = await openMenu('1st Squad');

		expect(within(menu).queryByRole('menuitem', { name: 'Add standard squads…' })).toBeNull();
	});

	it('deletes a squad with its teams and moves everyone in them to its platoon by default', async () => {
		const commands = renderTree();

		const dialog = await choose('1st Squad', 'Delete…');

		expect(within(dialog).getByRole('heading').textContent).toBe('Delete 1st Squad and its 2 sub-groups?');
		expect(within(dialog).getByText(/Alpha Team and Bravo Team are deleted with it\. 6 people move/)).toBeTruthy();
		expect(within(dialog).getByRole('button', { name: /^Move them to:/ }).textContent).toMatch(/1st Platoon/);
		await fireEvent.click(within(dialog).getByRole('button', { name: 'Delete and move 6' }));

		await waitFor(() => expect(commands.remove.mock.calls).toEqual([['sq1', 'plt1']]));
	});

	it('keeps a deleted subtree out of where its members can go, and sends Unassigned as null', async () => {
		const commands = renderTree();

		const dialog = await choose('1st Platoon', 'Delete…');
		await fireEvent.click(within(dialog).getByRole('button', { name: /^Move them to:/ }));
		await screen.findByRole('combobox', { name: 'Search Groups' });

		expect(shownOptions()).toEqual([
			['hq', false],
			['unassigned', false]
		]);
		await fireEvent.click(screen.getAllByRole('treeitem')[0]);
		await fireEvent.click(within(dialog).getByRole('button', { name: 'Delete and move 7' }));
		await waitFor(() => expect(commands.remove.mock.calls).toEqual([['plt1', 'hq']]));
	});

	it('keeps the delete open beside its failure', async () => {
		const commands = renderTree();
		commands.remove.mockRejectedValueOnce(new Error('Delete failed.'));

		const dialog = await choose('Bravo Team', 'Delete…');
		await fireEvent.click(within(dialog).getByRole('button', { name: 'Delete and move 1' }));

		expect((await within(dialog).findByRole('alert')).textContent?.trim()).toBe('Delete failed.');
		expect(commands.remove.mock.calls).toEqual([['bravo', 'sq1']]);
	});
});
