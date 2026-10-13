// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { useDataTableSelection } from '$lib/components/ui/data-table';
import { stubWorkspaceToolbarLayout } from '$lib/test-support/workspaceToolbarLayout';
import type { Personnel } from '$features/personnel/contracts';
import type { DataTableSelectionState } from '$lib/components/ui/data-table';
import RosterPicker from './RosterPicker.svelte';

function makeSelection(): DataTableSelectionState<Personnel> {
	const selectedKeys = new Set<string | number>();
	return {
		get selectedKeys() {
			return selectedKeys;
		},
		get selectedRows() {
			return [];
		},
		get selectedCount() {
			return selectedKeys.size;
		},
		isSelected: () => false,
		toggleRow: () => {},
		clear: () => selectedKeys.clear(),
		get allPageRowsSelected() {
			return false;
		},
		get somePageRowsSelected() {
			return false;
		},
		toggleAllPageRows: () => {}
	};
}

function personnel(overrides: Partial<Personnel>): Personnel {
	return {
		id: 'p1',
		rank: 'SGT',
		lastName: 'Able',
		firstName: 'Ann',
		mos: '11B',
		clinicRole: '',
		groupId: 'group-1',
		groupName: 'Alpha',
		...overrides
	};
}

describe('RosterPicker', () => {
	afterEach(() => {
		cleanup();
		vi.unstubAllGlobals();
	});

	const roster = [
		{
			group: 'Alpha',
			personnel: [
				personnel({ id: 'p1', lastName: 'Able', mos: '11B' }),
				personnel({ id: 'p2', lastName: 'Baker', mos: '68W' })
			]
		}
	];

	function renderPicker() {
		const people = roster.flatMap((group) => group.personnel);
		const selection = useDataTableSelection<Personnel>({ rows: () => people, rowKey: (person) => person.id });
		render(RosterPicker, { props: { personnelByGroup: roster, selection } });
		return selection;
	}

	it('selects only the people the toolbar search shows, then clears from the toolbar', async () => {
		const selection = renderPicker();
		const toolbar = screen.getByRole('toolbar', { name: 'Roster picker controls' });

		await fireEvent.input(within(toolbar).getByRole('searchbox', { name: 'Search by name, rank, MOS, or role...' }), {
			target: { value: '68w' }
		});
		await fireEvent.click(within(toolbar).getByRole('button', { name: 'Select shown' }));
		expect([...selection.selectedKeys]).toEqual(['p2']);
		expect(screen.getByText('1 of 1 selected'), 'counts against the rows the search shows').toBeTruthy();

		await fireEvent.click(within(toolbar).getByRole('button', { name: 'Clear' }));
		expect(selection.selectedCount).toBe(0);
		expect(screen.getByText('0 of 1 selected')).toBeTruthy();
	});

	it('keeps search on the row and runs Select shown from More when the row folds', async () => {
		const layOut = stubWorkspaceToolbarLayout();
		const selection = renderPicker();
		await layOut(1);

		const toolbar = screen.getByRole('toolbar', { name: 'Roster picker controls' });
		expect(within(toolbar).queryByRole('button', { name: 'Select shown' })).toBeNull();
		const more = within(toolbar).getByRole('button', { name: 'More Roster picker controls' });
		more.focus();
		await fireEvent.keyDown(more, { key: 'Enter' });
		await fireEvent.click(within(await screen.findByRole('menu')).getByRole('menuitem', { name: 'Select shown' }));

		await waitFor(() => expect(selection.selectedCount).toBe(2));
	});

	it('shows a placeholder when MOS and duty role are blank', () => {
		render(RosterPicker, {
			props: {
				personnelByGroup: [
					{
						group: 'Alpha',
						personnel: [personnel({ mos: '   ', clinicRole: ' ' })]
					}
				],
				selection: makeSelection()
			}
		});

		expect(screen.getByText('N/A')).toBeTruthy();
	});

	it('offers sorting on the data columns but not the selection column', () => {
		render(RosterPicker, {
			props: {
				personnelByGroup: [{ group: 'Alpha', personnel: [personnel({})] }],
				selection: makeSelection()
			}
		});

		const [selectionHeader, ...dataHeaders] = screen.getAllByRole('columnheader');
		expect(within(selectionHeader).queryByRole('button')).toBeNull();
		for (const name of ['Rank', 'Name', 'MOS / Duty Role']) {
			const header = dataHeaders.find((cell) => cell.textContent?.includes(name));
			expect(within(header!).getByRole('button', { name: `Sort by ${name}` })).toBeTruthy();
		}
	});
});
