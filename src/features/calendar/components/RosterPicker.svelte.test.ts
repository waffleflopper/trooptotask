// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/svelte';
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
