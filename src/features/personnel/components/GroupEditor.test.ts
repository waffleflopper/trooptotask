// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import type { ComponentProps } from 'svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Group } from '$features/personnel/contracts';
import type { Personnel } from '../personnel.types';
import type { RosterStatusDot } from '../rosterSignals';
import GroupEditor from './GroupEditor.svelte';

const groups: Group[] = [
	{ id: 'g-hq', name: 'HQ', sortOrder: 0 },
	{ id: 'g-2', name: '2nd Platoon', sortOrder: 1 },
	{ id: 'g-empty', name: 'Empty', sortOrder: 2 }
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
	person('p-ruiz', 'SPC', 'Ruiz', null)
];

const statuses: Record<string, RosterStatusDot> = {
	'p-alvarez': { kind: 'present' },
	'p-banks': { kind: 'away', type: { id: 'leave', name: 'Leave', color: '#c80' } as never },
	'p-okafor': { kind: 'skeleton' },
	'p-ruiz': { kind: 'none' }
};

function renderEditor(overrides: Partial<ComponentProps<typeof GroupEditor>> = {}) {
	const props = {
		groups,
		people,
		pinnedNames: ['2nd Platoon'],
		initialSelection: 'g-2',
		todayStatus: (p: Personnel) => statuses[p.id],
		canMovePerson: () => true,
		canMoveTo: () => true,
		onAdd: vi.fn(async () => {}),
		onRename: vi.fn(async () => {}),
		onReorder: vi.fn(async () => ({ status: 'saved' as const })),
		onTogglePin: vi.fn(async () => true),
		onDelete: vi.fn(async () => {}),
		onMove: vi.fn(async (ids: string[], groupId: string | null) => ({ groupId, movedIds: ids, unavailableIds: [] })),
		onClose: vi.fn(),
		...overrides
	};
	render(GroupEditor, { props });
	return props;
}

const groupRows = () =>
	within(screen.getByRole('list', { name: 'Groups in display order' }))
		.getAllByRole('listitem')
		.map((row) => row.textContent?.replace(/\s+/g, ' ').trim());

const memberRows = (name: string) =>
	within(screen.getByRole('list', { name: `Members of ${name}` }))
		.getAllByRole('listitem')
		.map((row) => row.textContent?.replace(/\s+/g, ' ').trim());

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
});

describe('GroupEditor', () => {
	it("lists Groups in display order with the viewer's pins and counts, and the selected Group's members", () => {
		renderEditor();

		expect(groupRows()).toEqual(['HQ 1', '2nd Platoon Pinned 2', 'Empty 0']);
		expect(
			screen
				.getByRole('button', { name: /^Unassigned/ })
				.textContent?.replace(/\s+/g, ' ')
				.trim()
		).toBe('Unassigned 1');
		expect(screen.getByRole('button', { name: 'Pinned to top' }).getAttribute('aria-pressed')).toBe('true');
		expect(memberRows('2nd Platoon')).toEqual(['SSG Alvarez, Pat Squad leader Present', 'PFC Banks, Pat Leave']);
	});

	it('shows Unassigned without rename, pin, Add people, Remove from Group or delete', async () => {
		renderEditor();

		await fireEvent.click(screen.getByRole('button', { name: /^Unassigned/ }));
		await fireEvent.click(screen.getByRole('checkbox', { name: 'Select SPC Ruiz, Pat' }));

		expect(memberRows('Unassigned')).toEqual(['SPC Ruiz, Pat']);
		expect(screen.queryByRole('button', { name: /^Rename/ })).toBeNull();
		expect(screen.queryByRole('button', { name: /^(Pin to top|Pinned to top)$/ })).toBeNull();
		expect(screen.queryByRole('button', { name: /^Add people/ })).toBeNull();
		expect(screen.queryByRole('button', { name: 'Remove from Group' })).toBeNull();
		expect(screen.queryByRole('button', { name: /^Delete/ })).toBeNull();
		expect(screen.getByRole('button', { name: 'Move to…' })).toBeTruthy();
	});

	it('adds a Group on Enter and keeps the name beside its error when the add fails', async () => {
		const onAdd = vi
			.fn()
			.mockResolvedValueOnce(undefined)
			.mockRejectedValueOnce(new Error('A Group with that name already exists.'));
		renderEditor({ onAdd });
		const field = screen.getByRole('textbox', { name: 'New group name' }) as HTMLInputElement;

		await fireEvent.input(field, { target: { value: '  Weapons  ' } });
		await fireEvent.keyDown(field, { key: 'Enter' });
		await waitFor(() => expect(field.value).toBe(''));
		await fireEvent.input(field, { target: { value: 'HQ' } });
		await fireEvent.keyDown(field, { key: 'Enter' });

		expect(await screen.findByText('A Group with that name already exists.')).toBeTruthy();
		expect(field.value).toBe('HQ');
		expect(onAdd.mock.calls).toEqual([['Weapons'], ['HQ']]);
	});

	it('reorders with Alt+Arrow on a Group and shows why an order did not save', async () => {
		const onReorder = vi.fn().mockResolvedValue({
			status: 'failed',
			message: 'The Group order changed somewhere else. The list shows the saved order.'
		});
		renderEditor({ onReorder });

		await fireEvent.keyDown(screen.getByRole('button', { name: /^Empty/ }), { key: 'ArrowUp', altKey: true });

		expect(onReorder).toHaveBeenCalledWith(['g-hq', 'g-empty', 'g-2']);
		expect(
			await screen.findByText('The Group order changed somewhere else. The list shows the saved order.')
		).toBeTruthy();
	});

	it('renames inline on Enter, keeps the draft beside a failure, and cancels on Escape', async () => {
		const onRename = vi.fn().mockRejectedValueOnce(new Error('A Group with that name already exists.'));
		renderEditor({ onRename });

		await fireEvent.click(screen.getByRole('button', { name: 'Rename 2nd Platoon' }));
		const field = screen.getByRole('textbox', { name: 'Group name' }) as HTMLInputElement;
		await fireEvent.input(field, { target: { value: ' HQ ' } });
		await fireEvent.keyDown(field, { key: 'Enter' });

		expect(await screen.findByText('A Group with that name already exists.')).toBeTruthy();
		expect(field.value).toBe(' HQ ');
		await fireEvent.keyDown(field, { key: 'Escape' });
		expect(screen.queryByRole('textbox', { name: 'Group name' })).toBeNull();
		expect(onRename).toHaveBeenCalledWith('g-2', 'HQ');
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

	it('offers the other Groups and Unassigned under Move to…', async () => {
		const { onMove } = renderEditor();

		await fireEvent.click(screen.getByRole('checkbox', { name: 'Select PFC Banks, Pat' }));
		await fireEvent.pointerDown(screen.getByRole('button', { name: 'Move to…' }), { button: 0, pointerType: 'mouse' });
		const menu = await screen.findByRole('menu');

		expect(
			within(menu)
				.getAllByRole('menuitem')
				.map((item) => item.textContent?.trim())
		).toEqual(['HQ', 'Empty', 'Unassigned']);
		await fireEvent.click(within(menu).getByRole('menuitem', { name: 'HQ' }));
		await waitFor(() => expect(onMove).toHaveBeenCalledWith(['p-banks'], 'g-hq'));
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
		).toEqual(['SPC Ruiz, Pat', 'SGT Okafor, Pat']);
		await fireEvent.click(within(listbox).getByRole('option', { name: /Ruiz/ }));
		await waitFor(() => expect(onMove).toHaveBeenCalledWith(['p-ruiz'], 'g-2'));
	});

	it('deletes a Group after asking where its members go, defaulting to the next Group', async () => {
		const onDelete = vi.fn().mockRejectedValueOnce(new Error('That Group is no longer available.'));
		renderEditor({ onDelete });

		await fireEvent.click(screen.getByRole('button', { name: 'Delete 2nd Platoon…' }));
		const strip = screen.getByRole('group', { name: 'Delete 2nd Platoon' });
		expect(strip.textContent?.replace(/\s+/g, ' ')).toContain(
			'Delete 2nd Platoon? 2 members need a new Group. Their records, notes and history are not affected.'
		);
		const picker = within(strip).getByRole('combobox', { name: 'Move members to' }) as HTMLSelectElement;
		expect(picker.value).toBe('g-empty');
		await waitFor(() => expect(document.activeElement).toBe(picker));
		await fireEvent.click(within(strip).getByRole('button', { name: 'Delete and move 2' }));

		expect(await within(strip).findByText('That Group is no longer available.')).toBeTruthy();
		expect(onDelete).toHaveBeenCalledWith('g-2', 'g-empty');
		await fireEvent.change(within(strip).getByRole('combobox', { name: 'Move members to' }), {
			target: { value: 'unassigned' }
		});
		await fireEvent.click(within(strip).getByRole('button', { name: 'Delete and move 2' }));
		await waitFor(() => expect(onDelete).toHaveBeenLastCalledWith('g-2', null));
	});

	it('deletes an empty Group with a plain confirmation and returns focus on Cancel', async () => {
		const { onDelete } = renderEditor({ initialSelection: 'g-empty' });

		await fireEvent.click(screen.getByRole('button', { name: 'Delete Empty…' }));
		const strip = screen.getByRole('group', { name: 'Delete Empty' });

		expect(within(strip).queryByRole('combobox')).toBeNull();
		await waitFor(() => expect(document.activeElement).toBe(within(strip).getByRole('button', { name: 'Cancel' })));
		await fireEvent.click(within(strip).getByRole('button', { name: 'Cancel' }));
		await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Delete Empty…' })));

		await fireEvent.click(screen.getByRole('button', { name: 'Delete Empty…' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
		await waitFor(() => expect(onDelete).toHaveBeenCalledWith('g-empty', null));
	});
});
