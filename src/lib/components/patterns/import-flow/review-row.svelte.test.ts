// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ReviewRow from './review-row.svelte';
import type { ReviewColumn } from './reviewLayout';
import { sourceRowId, type ReviewedRow } from './rowModel';

afterEach(cleanup);

const columns: ReviewColumn[] = [
	{ field: 'training', label: 'Training', kind: 'text' },
	{ field: 'completed', label: 'Completed', kind: 'text' },
	{ field: 'note', label: 'Notes', kind: 'text' }
];
const source = {
	id: sourceRowId(0, 1),
	sheetIndex: 0,
	sheetName: 'Tracker',
	rowNumber: 2,
	raw: { training: 'CPR/BLS', completed: 'X', note: 'Refresher' },
	cells: []
};

function card(row: ReviewedRow<unknown>, compact = true) {
	render(ReviewRow, {
		row,
		columns,
		identityColumns: [],
		label: 'Garcia, Luis',
		compact,
		template: '',
		onEdit: vi.fn(),
		onSkip: vi.fn(),
		onShowQuestion: vi.fn()
	});
}

describe('review card', () => {
	it('names the record an update changes beside the field it changes', () => {
		card({
			row: source,
			resolved: { completed: '2026-05-04' },
			outcome: 'update',
			key: 'p1:t-cpr',
			change: {},
			diff: [{ label: 'Notes', before: '', after: 'Refresher' }]
		});

		expect(screen.getByText('CPR/BLS · 2026-05-04')).toBeTruthy();
	});

	it('names the record a row needing a fix belongs to beside the field to fix', () => {
		card({
			row: source,
			outcome: 'fix',
			problems: [{ field: 'note', message: 'Too long.' }],
			questions: []
		});

		expect(screen.getByText('CPR/BLS · X')).toBeTruthy();
		expect(screen.getByRole('textbox', { name: /^Notes/ })).toBeTruthy();
	});

	it('puts a change whose label differs from its column in that column, old value struck', () => {
		card(
			{
				row: source,
				outcome: 'update',
				key: 'p1:t-cpr',
				change: {},
				diff: [{ label: 'Expires', field: 'completed', before: '2026-12-01', after: '2027-12-01' }]
			},
			false
		);

		const cell = screen.getByText('2027-12-01').closest('[role="cell"]');
		expect(cell?.textContent).toContain('2026-12-01');
	});

	it('shows the incoming values of a replacement next to the entry it replaces', () => {
		render(ReviewRow, {
			row: {
				row: {
					...source,
					sheetName: 'Statuses',
					raw: { status: 'TDY', startDate: '2026-11-03', endDate: '2026-11-11' }
				},
				outcome: 'update',
				key: 'diaz',
				change: {},
				diff: [{ label: 'Replaces', before: '2026-11-05 → 2026-11-12 Leave', after: '' }]
			},
			columns: [
				{ field: 'status', label: 'Status', kind: 'text' },
				{ field: 'startDate', label: 'From', kind: 'date' },
				{ field: 'endDate', label: 'To', kind: 'date' }
			],
			identityColumns: [],
			label: 'Diaz, Renata',
			compact: true,
			template: '',
			onEdit: vi.fn(),
			onSkip: vi.fn(),
			onShowQuestion: vi.fn()
		});

		expect(screen.getByText('TDY · 2026-11-03 · 2026-11-11')).toBeTruthy();
		expect(screen.getByText('2026-11-05 → 2026-11-12 Leave')).toBeTruthy();
	});

	it('gives every entry a replacement removes its own line', () => {
		card({
			row: source,
			outcome: 'update',
			key: 'diaz',
			change: {},
			diff: [
				{ label: 'Replaces', before: '2026-11-05 → 2026-11-12 Leave', after: '' },
				{ label: 'Replaces', before: '2026-11-20 → 2026-11-20 Appointment', after: '' }
			]
		});

		expect(screen.getByText('2026-11-05 → 2026-11-12 Leave')).toBeTruthy();
		expect(screen.getByText('2026-11-20 → 2026-11-20 Appointment')).toBeTruthy();
	});
});
