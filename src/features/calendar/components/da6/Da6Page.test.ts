// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/svelte';
import Da6Page from './Da6Page.svelte';
import { da6Segment, simulateRoster } from '../../roster/rosterEngine';
import { storedR4 } from '../../roster/rosterFixtures.test-support';
import type { Da6View } from '../../utils/da6View';

const { gotoMock } = vi.hoisted(() => ({ gotoMock: vi.fn() }));
vi.mock('$app/navigation', () => ({ goto: gotoMock }));

const STAFF_DUTY = { id: 'staff-duty', name: 'Staff Duty', shortName: 'SD' };
const r4: Da6View = {
	rosters: [STAFF_DUTY, { id: 'cq', name: 'Charge of Quarters', shortName: 'CQ' }],
	roster: STAFF_DUTY,
	month: '2026-10',
	today: '2026-10-16',
	sheets: [{ from: '2026-10-01', to: null, segment: da6Segment(simulateRoster(storedR4()), '2026-10')! }]
};

function renderR4(view: Da6View | null = r4) {
	return render(Da6Page, {
		orgName: 'C Co, 526th BSB',
		orgUrlSegment: 'c-co',
		typeId: 'staff-duty',
		month: '2026-10',
		view
	});
}

/** The visible text of one person's cells, from 1 Oct, read through the table's own headers. */
function rowCells(lastName: string, from: number, through: number): string[] {
	const row = screen.getByRole('rowheader', { name: lastName }).closest('tr')!;
	return within(row)
		.getAllByRole('cell')
		.slice(from - 1, through)
		.map((cell) => cell.querySelector('[aria-hidden="true"]')?.textContent?.trim() ?? '');
}

afterEach(() => {
	cleanup();
	gotoMock.mockReset();
});

describe('DA 6 for the R4 fixture', () => {
	it('shows the same numbers, codes and pulled duty as the paper form', () => {
		renderR4();

		expect(rowCells('Ortiz', 11, 17)).toEqual(['12', 'A', 'A', 'A', 'A', 'A', '13']);
		expect(rowCells('Patel', 6, 9)).toEqual(['4', 'D5', 'D6', '7']);
		expect(rowCells('Grant', 1, 3)).toEqual(['13', '1', '2']);
		expect(rowCells('Okafor', 19, 24)).toEqual(['12', 'A', 'A', 'A', 'A', '13']);
		expect(screen.getAllByRole('rowheader').filter((header) => header.textContent?.trim() === 'Moreno')).toHaveLength(
			0
		);
	});

	it('gives every code a text equivalent under its row and column headers', () => {
		renderR4();

		const ortiz = screen.getByRole('rowheader', { name: 'Ortiz' }).closest('tr')!;
		const twelfth = within(ortiz).getAllByRole('cell')[11];
		expect(twelfth.textContent).toContain('A, away (TDY), count holds at 12');
		const grant = screen.getByRole('rowheader', { name: 'Grant' }).closest('tr')!;
		expect(within(grant).getAllByRole('cell')[0].textContent).toContain('Pulled duty at 13');
		expect(screen.getByRole('columnheader', { name: '12 Oct' }).getAttribute('scope')).toBe('col');
	});

	it('works out the day a column header selects', async () => {
		renderR4();
		const strip = screen.getByRole('region', { name: 'Show the work' });
		within(strip).getByRole('heading', { name: '16 Oct, worked out' });

		await fireEvent.click(screen.getByRole('button', { name: '20 Oct' }));

		within(strip).getByRole('heading', { name: '20 Oct, planned' });
		expect(strip.textContent).toContain('Okafor is away (Leave), so Nguyen pulls it.');
		expect(screen.getByRole('button', { name: '20 Oct' }).getAttribute('aria-pressed')).toBe('true');
	});

	it('switches roster and keeps the month', async () => {
		renderR4();

		await fireEvent.click(screen.getByRole('radio', { name: 'Charge of Quarters' }));

		expect(gotoMock).toHaveBeenCalledWith('/org/c-co/calendar/rosters/cq?month=2026-10');
	});

	it('holds the grid with a skeleton until the month arrives', () => {
		renderR4(null);

		expect(screen.getByRole('status').textContent).toContain('Loading the DA 6');
		expect(screen.queryByRole('table')).toBeNull();
		expect((screen.getByRole('button', { name: /Print DA 6/ }) as HTMLButtonElement).disabled).toBe(true);
	});
});
