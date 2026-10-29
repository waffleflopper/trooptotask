// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import type { ComponentProps } from 'svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Group } from '$features/personnel/contracts';
import type { Personnel } from '../personnel.types';
import type { RosterStatusDot } from '../rosterSignals';
import GroupEditor from './GroupEditor.svelte';

const groups: Group[] = [
	{ id: 'g-hq', name: 'HQ', sortOrder: 0, parentId: null, depth: 1 as const },
	{ id: 'g-2', name: '2nd Platoon', sortOrder: 1, parentId: null, depth: 1 as const },
	{ id: 'g-2-sq1', name: '1st Squad', sortOrder: 0, parentId: 'g-2', depth: 2 as const },
	{ id: 'g-empty', name: 'Empty', sortOrder: 2, parentId: null, depth: 1 as const }
];

function person(id: string, rank: string, lastName: string, groupId: string | null, clinicRole = ''): Personnel {
	return {
		id,
		rank,
		lastName,
		firstName: 'Pat',
		mos: '',
		clinicRole,
		groupId,
		groupName: groups.find((group) => group.id === groupId)?.name ?? ''
	} as Personnel;
}

const people = [
	person('p-alvarez', 'SSG', 'Alvarez', 'g-2', 'Squad leader'),
	person('p-banks', 'PFC', 'Banks', 'g-2'),
	person('p-okafor', 'SGT', 'Okafor', 'g-hq'),
	person('p-ruiz', 'SPC', 'Ruiz', null),
	person('p-diaz', 'SPC', 'Diaz', 'g-2-sq1')
];

const statuses: Record<string, RosterStatusDot> = {
	'p-alvarez': { kind: 'present' },
	'p-banks': { kind: 'away', type: { id: 'leave', name: 'Leave', color: '#c80' } as never },
	'p-okafor': { kind: 'skeleton' },
	'p-ruiz': { kind: 'none' },
	'p-diaz': { kind: 'present' }
};

function renderEditor(overrides: Partial<ComponentProps<typeof GroupEditor>> = {}) {
	const props = {
		groups,
		people,
		pinnedGroupIds: ['g-2'],
		initialSelection: 'g-2',
		todayStatus: (p: Personnel) => statuses[p.id],
		canMovePerson: () => true,
		canMoveTo: () => true,
		commands: {
			add: vi.fn(async (name: string, parentId: string | null) => ({
				id: 'g-new',
				name,
				sortOrder: 3,
				parentId,
				depth: 1 as const
			})),
			rename: vi.fn(async () => {}),
			move: vi.fn(async () => {}),
			reorder: vi.fn(async () => ({ status: 'saved' as const })),
			remove: vi.fn(async () => {})
		},
		onTogglePin: vi.fn(async () => true),
		onMove: vi.fn(async (ids: string[], groupId: string | null) => ({ groupId, movedIds: ids, unavailableIds: [] })),
		onClose: vi.fn(),
		...overrides
	};
	render(GroupEditor, { props });
	return props;
}

const groupRows = (listName = 'Groups in display order') =>
	[
		...screen.getByRole('list', { name: listName }).querySelectorAll(':scope > [role="listitem"] > div:first-child')
	].map((row) => row.textContent?.replace(/\s+/g, ' ').trim());

const shownOptions = () =>
	screen
		.getAllByRole('treeitem')
		.map((item) => [item.id.split('-row-')[1], item.getAttribute('aria-disabled') === 'true']);

const memberRows = (name: string) =>
	within(screen.getByRole('list', { name: `Members of ${name}` }))
		.getAllByRole('listitem')
		.map((row) => row.textContent?.replace(/\s+/g, ' ').trim());

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
});

describe('GroupEditor', () => {
	it("lists the Group tree with the viewer's pins and subtree counts, and the selected Group's own members", () => {
		renderEditor();

		expect(groupRows()).toEqual(['HQ 1', '2nd Platoon Pinned 3', 'Empty 0']);
		expect(groupRows('Sub-groups of 2nd Platoon')).toEqual(['1st Squad 1']);
		expect(
			screen
				.getByRole('button', { name: /^Unassigned/ })
				.textContent?.replace(/\s+/g, ' ')
				.trim()
		).toBe('Unassigned 1');
		expect(screen.getByRole('button', { name: 'Pinned to top' }).getAttribute('aria-pressed')).toBe('true');
		expect(memberRows('2nd Platoon')).toEqual(['SSG Alvarez, Pat Squad leader Present', 'PFC Banks, Pat Leave']);
	});

	it('shows Unassigned without pin, Add people or Remove from Group', async () => {
		renderEditor();

		await fireEvent.click(screen.getByRole('button', { name: /^Unassigned/ }));
		await fireEvent.click(screen.getByRole('checkbox', { name: 'Select SPC Ruiz, Pat' }));

		expect(memberRows('Unassigned')).toEqual(['SPC Ruiz, Pat']);
		expect(screen.queryByRole('button', { name: /^(Pin to top|Pinned to top)$/ })).toBeNull();
		expect(screen.queryByRole('button', { name: /^Add people/ })).toBeNull();
		expect(screen.queryByRole('button', { name: 'Remove from Group' })).toBeNull();
		expect(screen.getByRole('button', { name: /^Move selected members to:/ })).toBeTruthy();
	});

	it('names a sub-group by its path and offers no pin, since only top-level Groups pin', async () => {
		renderEditor();

		await fireEvent.click(screen.getByRole('button', { name: /^1st Squad/ }));

		expect(screen.getByRole('heading', { name: '2nd Platoon › 1st Squad' })).toBeTruthy();
		expect(memberRows('2nd Platoon › 1st Squad')).toEqual(['SPC Diaz, Pat Present']);
		expect(screen.queryByRole('button', { name: /^(Pin to top|Pinned to top)$/ })).toBeNull();
	});

	it('moves checked members in one write and says who could not be moved', async () => {
		const onMove = vi.fn(async (_ids: string[], groupId: string | null) => ({
			groupId,
			movedIds: ['p-alvarez'],
			unavailableIds: ['p-banks']
		}));
		renderEditor({ onMove });

		await fireEvent.click(screen.getByRole('checkbox', { name: 'Select all members of 2nd Platoon' }));
		expect(screen.getByRole('toolbar', { name: 'Selected members' }).textContent).toContain('2 selected');
		await fireEvent.click(screen.getByRole('button', { name: 'Remove from Group' }));

		expect(onMove).toHaveBeenCalledWith(['p-alvarez', 'p-banks'], null);
		expect(
			await screen.findByText('1 person was not moved. They were archived or are no longer on the roster.')
		).toBeTruthy();
		expect(screen.queryByRole('toolbar', { name: 'Selected members' })).toBeNull();
	});

	it.each([
		{ operation: 'members', selection: 'unchanged' },
		{ operation: 'members', selection: 'another Group' },
		{ operation: 'members', selection: 'away and back' },
		{ operation: 'pin', selection: 'unchanged' },
		{ operation: 'pin', selection: 'another Group' },
		{ operation: 'pin', selection: 'away and back' }
	])(
		'keeps a delayed $operation failure scoped to its request with selection $selection',
		async ({ operation, selection }) => {
			const reply = Promise.withResolvers<never>();
			const onMove = vi.fn(() => reply.promise);
			const onTogglePin = vi.fn(() => reply.promise);
			renderEditor({ onMove, onTogglePin });

			if (operation === 'members') {
				await fireEvent.click(screen.getByRole('checkbox', { name: 'Select PFC Banks, Pat' }));
				await fireEvent.click(screen.getByRole('button', { name: 'Remove from Group' }));
				expect(onMove).toHaveBeenCalledWith(['p-banks'], null);
			} else {
				await fireEvent.click(screen.getByRole('button', { name: 'Pinned to top' }));
				expect(onTogglePin).toHaveBeenCalledWith('g-2');
			}
			expect(screen.getByRole('button', { name: 'Add people to 2nd Platoon' }).hasAttribute('disabled')).toBe(true);

			if (selection !== 'unchanged') await fireEvent.click(screen.getByRole('button', { name: /^HQ/ }));
			if (selection === 'away and back') await fireEvent.click(screen.getByRole('button', { name: /^2nd Platoon/ }));
			const selectedName = selection === 'another Group' ? 'HQ' : '2nd Platoon';
			expect(screen.getByRole('heading', { name: selectedName })).toBeTruthy();
			reply.reject(new Error('Request denied'));

			await waitFor(() =>
				expect(screen.getByRole('button', { name: `Add people to ${selectedName}` }).hasAttribute('disabled')).toBe(
					false
				)
			);
			if (selection === 'unchanged') expect(screen.getByRole('alert').textContent).toBe('Request denied');
			else expect(screen.queryByRole('alert')).toBeNull();
		}
	);

	it('moves checked members to any level of the tree or to Unassigned', async () => {
		const { onMove } = renderEditor();

		await fireEvent.click(screen.getByRole('checkbox', { name: 'Select PFC Banks, Pat' }));
		await fireEvent.click(screen.getByRole('button', { name: /^Move selected members to:/ }));
		const search = await screen.findByRole('combobox', { name: 'Search Groups' });

		expect(shownOptions()).toEqual([
			['g-hq', false],
			['g-2', true],
			['g-empty', false],
			['unassigned', false]
		]);
		await fireEvent.input(search, { target: { value: 'squad' } });
		const squad = screen.getAllByRole('treeitem').find((item) => item.id.endsWith('-row-g-2-sq1'));
		await fireEvent.click(squad!);
		await waitFor(() => expect(onMove).toHaveBeenCalledWith(['p-banks'], 'g-2-sq1'));
	});

	it('hides member checkboxes and Remove from Group the viewer may not use', async () => {
		renderEditor({
			canMovePerson: (p) => p.id !== 'p-banks',
			canMoveTo: (groupId) => groupId !== null
		});

		expect(screen.queryByRole('checkbox', { name: 'Select PFC Banks, Pat' })).toBeNull();
		await fireEvent.click(screen.getByRole('checkbox', { name: 'Select SSG Alvarez, Pat' }));
		expect(screen.queryByRole('button', { name: 'Remove from Group' })).toBeNull();
	});

	it('leaves out the Today column for a viewer who cannot see availability', () => {
		renderEditor({ todayStatus: undefined });

		expect(screen.queryByText('Today')).toBeNull();
		expect(memberRows('2nd Platoon')).toEqual(['SSG Alvarez, Pat Squad leader', 'PFC Banks, Pat']);
	});

	it('lists Unassigned people first under Add people and moves the one picked into the Group', async () => {
		const { onMove } = renderEditor();

		await fireEvent.click(screen.getByRole('button', { name: 'Add people to 2nd Platoon' }));
		const listbox = await screen.findByRole('listbox');

		expect(
			within(listbox)
				.getAllByRole('option')
				.map((option) => option.textContent?.replace(/\s+/g, ' ').trim())
		).toEqual(['SPC Ruiz, Pat', 'SGT Okafor, Pat', 'SPC Diaz, Pat']);
		await fireEvent.click(within(listbox).getByRole('option', { name: /Ruiz/ }));
		await waitFor(() => expect(onMove).toHaveBeenCalledWith(['p-ruiz'], 'g-2'));
	});

	it('shows Unassigned once the selected Group is deleted', async () => {
		const props = { ...renderEditor() };
		cleanup();
		render(GroupEditor, { props: { ...props, groups: groups.filter((group) => !group.id.startsWith('g-2')) } });

		expect(screen.getByRole('heading', { name: 'Unassigned' })).toBeTruthy();
	});
});

describe('GroupEditor before the first Group', () => {
	const hintFor = (field: HTMLElement) => {
		const id = field.getAttribute('aria-describedby');
		return id ? document.getElementById(id) : null;
	};

	function renderEmpty(overrides: Partial<ComponentProps<typeof GroupEditor>> = {}) {
		const props = renderEditor({ groups: [], people: [], initialSelection: null, ...overrides });
		return { ...props, field: screen.getByRole('textbox', { name: 'New group name' }) };
	}

	it('focuses the name field with a hint, and leaves out what needs a Group', async () => {
		const { field } = renderEmpty();

		await waitFor(() => expect(document.activeElement).toBe(field));
		expect(hintFor(field)).not.toBeNull();
		expect(screen.queryByRole('list', { name: 'Groups in display order' })).toBeNull();
		expect(screen.queryByRole('button', { name: /^Unassigned/ })).toBeNull();
		expect(screen.queryByRole('button', { name: /^Delete/ })).toBeNull();
	});

	it('drops the hint on the first keystroke', async () => {
		const { field } = renderEmpty();

		await fireEvent.input(field, { target: { value: 'H' } });

		expect(hintFor(field)).toBeNull();
	});

	it('drops the hint on Escape and keeps the manager open', async () => {
		const { field, onClose } = renderEmpty();

		await fireEvent.keyDown(field, { key: 'Escape' });

		expect(hintFor(field)).toBeNull();
		expect(onClose).not.toHaveBeenCalled();
	});

	it('drops the hint from its close button', async () => {
		const { field } = renderEmpty();

		await fireEvent.click(screen.getByRole('button', { name: 'Dismiss hint' }));

		expect(hintFor(field)).toBeNull();
	});

	it('never shows the hint once a Group exists', () => {
		renderEditor();

		expect(hintFor(screen.getByRole('textbox', { name: 'New group name' }))).toBeNull();
	});

	it('explains where members come from while no one is on the roster', () => {
		renderEditor({ groups: [groups[0]], people: [], initialSelection: 'g-hq' });

		expect(screen.queryByRole('list', { name: 'Members of HQ' })).toBeNull();
		expect(screen.queryByRole('checkbox')).toBeNull();
		expect(screen.getByRole('region', { name: 'HQ' }).textContent).toMatch(/No one in HQ/);
	});
});
