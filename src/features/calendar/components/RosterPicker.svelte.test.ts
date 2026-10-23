// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { useDataTableSelection } from '$lib/components/ui/data-table';
import { stubToolbarWidths } from '$lib/test-support/toolbarWidths';
import type { Personnel } from '$features/personnel/contracts';
import type { DataTableSelectionState } from '$lib/components/ui/data-table';
import type { AvailabilityEntry, StatusType } from '$features/calendar/contracts';
import { classifyBulkAddOverlaps } from '$features/calendar/utils/availabilityMutation';
import { projectBulkRosterAvailability } from '$features/calendar/utils/bulkRosterAvailability';
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
		const { layOut } = stubToolbarWidths();
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

describe('RosterPicker with availability', () => {
	afterEach(cleanup);

	const statusTypes: StatusType[] = ['leave', 'sick'].map((id, sortOrder) => ({
		id,
		name: id === 'leave' ? 'Leave' : 'Sick',
		color: '#48bb78',
		textColor: '#ffffff',
		shortLabel: null,
		rosterEffect: 'A',
		sortOrder
	}));
	const able = personnel({ id: 'able', lastName: 'Able', firstName: 'Ann' });
	const baker = personnel({ id: 'baker', lastName: 'Baker', firstName: 'Bo' });
	const cole = personnel({ id: 'cole', lastName: 'Cole', firstName: 'Cy' });
	const eve = personnel({ id: 'eve', lastName: 'Eve', firstName: 'Ed' });
	const dale = personnel({ id: 'dale', lastName: 'Dale', firstName: 'Di', groupId: 'g2', groupName: 'Bravo' });
	const roster = [
		{ group: 'Alpha', personnel: [able, baker, cole, eve] },
		{ group: 'Bravo', personnel: [dale] }
	];
	const entries: AvailabilityEntry[] = [
		{
			id: 'e1',
			personnelId: 'baker',
			statusTypeId: 'sick',
			startDate: '2026-10-26',
			endDate: '2026-10-26',
			note: null
		},
		{
			id: 'e2',
			personnelId: 'cole',
			statusTypeId: 'leave',
			startDate: '2026-10-28',
			endDate: '2026-10-31',
			note: null
		},
		{ id: 'e3', personnelId: 'dale', statusTypeId: 'leave', startDate: '2026-10-20', endDate: '2026-10-26', note: null }
	];

	function renderPicker() {
		const range = { rangeStart: '2026-10-26', rangeEnd: '2026-10-28' };
		const overlaps = classifyBulkAddOverlaps({ entries, statusTypeId: 'leave', range });
		const availability = projectBulkRosterAvailability({ overlaps, statusTypes, range });
		const people = roster.flatMap((group) => group.personnel);
		const selection = useDataTableSelection<Personnel>({ rows: () => people, rowKey: (person) => person.id });
		render(RosterPicker, { props: { personnelByGroup: roster, selection, availability } });
		return selection;
	}

	const selected = (selection: DataTableSelectionState<Personnel>) => [...selection.selectedKeys].sort();

	it('refuses a blocked person on the checkbox, the row click and the group toggle', async () => {
		const selection = renderPicker();
		const checkbox = screen.getByRole('checkbox', { name: 'Select SGT Cole, Cy' }) as HTMLButtonElement;

		expect(checkbox.disabled).toBe(true);
		await fireEvent.click(screen.getByText('Cole, Cy'));
		expect(selected(selection)).toEqual([]);

		await fireEvent.click(screen.getByRole('checkbox', { name: 'Select Alpha group' }));
		expect(selected(selection)).toEqual(['able', 'baker', 'eve']);
		expect(screen.getByRole('checkbox', { name: 'Select Alpha group' }).getAttribute('aria-checked')).toBe('true');
	});

	it('disables a group whose people are all blocked', () => {
		renderPicker();

		expect((screen.getByRole('checkbox', { name: 'Select Bravo group' }) as HTMLButtonElement).disabled).toBe(true);
	});

	it('keeps a person with another status selectable by hand', async () => {
		const selection = renderPicker();

		await fireEvent.click(screen.getByRole('checkbox', { name: 'Select SGT Baker, Bo' }));

		expect(selected(selection)).toEqual(['baker']);
	});

	it('explains why a row is disabled through the checkbox description', () => {
		renderPicker();
		const checkbox = screen.getByRole('checkbox', { name: 'Select SGT Cole, Cy' });
		const reason = document.getElementById(checkbox.getAttribute('aria-describedby')!);

		expect(reason).not.toBeNull();
		expect(reason!.textContent).toContain('Leave');
	});

	it('limits Select available to the people the search shows', async () => {
		const selection = renderPicker();
		const toolbar = screen.getByRole('toolbar', { name: 'Roster picker controls' });
		await fireEvent.input(within(toolbar).getByRole('searchbox'), { target: { value: 'able' } });

		await fireEvent.click(within(toolbar).getByRole('button', { name: 'Select available' }));

		expect(selected(selection)).toEqual(['able']);
	});

	it('shows a selected person as unchecked while they are blocked and checked again when they are not', () => {
		const people = roster.flatMap((group) => group.personnel);
		const selection = useDataTableSelection<Personnel>({ rows: () => people, rowKey: (person) => person.id });
		selection.toggleRow(cole, 0, true);
		const range = { rangeStart: '2026-10-26', rangeEnd: '2026-10-28' };
		const project = (statusTypeId: string) =>
			projectBulkRosterAvailability({
				overlaps: classifyBulkAddOverlaps({ entries, statusTypeId, range }),
				statusTypes,
				range
			});

		const view = render(RosterPicker, {
			props: { personnelByGroup: roster, selection, availability: project('leave') }
		});
		const checkbox = () => screen.getByRole('checkbox', { name: 'Select SGT Cole, Cy' });
		expect(checkbox().getAttribute('aria-checked')).toBe('false');

		view.rerender({ availability: project('sick') });
		expect(checkbox().getAttribute('aria-checked')).toBe('true');
	});
});
