// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AssignmentType } from '$features/calendar/contracts';
import MonthlyAssignmentPlanner from './MonthlyAssignmentPlanner.svelte';

const staffDuty: AssignmentType = {
	id: 'type-sd',
	name: 'Staff Duty',
	shortName: 'SD',
	assignTo: 'personnel',
	color: '#2563eb',
	exemptPersonnelIds: [],
	showInDateHeader: false
};

afterEach(cleanup);

describe('MonthlyAssignmentPlanner', () => {
	it('keeps the Clear confirmation busy until the month clear settles and blocks another clear meanwhile', async () => {
		let settle!: (saved: boolean) => void;
		const onSetAssignmentBatch = vi.fn(() => new Promise<boolean>((resolve) => (settle = resolve)));
		render(MonthlyAssignmentPlanner, {
			props: {
				currentDate: new Date(2026, 9, 1),
				onDateChange: vi.fn(),
				rangeStatus: 'ready',
				onRetry: vi.fn(),
				assignmentTypes: [staffDuty],
				assignments: [],
				personnelByGroup: [],
				groups: [],
				onSetAssignment: vi.fn(),
				onSetAssignmentBatch
			}
		});
		const clear = screen.getByRole('button', { name: 'Clear all Staff Duty' }) as HTMLButtonElement;

		await fireEvent.click(clear);
		const confirmation = screen.getByRole('alertdialog');
		await fireEvent.click(within(confirmation).getByRole('button', { name: 'Clear All' }));

		expect(onSetAssignmentBatch).toHaveBeenCalledTimes(1);
		expect(screen.getByRole('alertdialog')).toBe(confirmation);
		expect(confirmation.getAttribute('aria-busy')).toBe('true');
		expect(clear.disabled).toBe(true);

		settle(true);

		await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
		expect(clear.disabled).toBe(false);
	});
	it('keeps the Clear confirmation open for a retry when the month clear fails', async () => {
		const onSetAssignmentBatch = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
		render(MonthlyAssignmentPlanner, {
			props: {
				currentDate: new Date(2026, 9, 1),
				onDateChange: vi.fn(),
				rangeStatus: 'ready',
				onRetry: vi.fn(),
				assignmentTypes: [staffDuty],
				assignments: [],
				personnelByGroup: [],
				groups: [],
				onSetAssignment: vi.fn(),
				onSetAssignmentBatch
			}
		});

		await fireEvent.click(screen.getByRole('button', { name: 'Clear all Staff Duty' }));
		const confirmation = screen.getByRole('alertdialog');
		await fireEvent.click(within(confirmation).getByRole('button', { name: 'Clear All' }));

		await waitFor(() => expect(confirmation.hasAttribute('aria-busy')).toBe(false));
		expect(screen.getByRole('alertdialog')).toBe(confirmation);

		await fireEvent.click(within(confirmation).getByRole('button', { name: 'Clear All' }));
		await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
		expect(onSetAssignmentBatch).toHaveBeenCalledTimes(2);
	});
	it('names the month table and the Quick Fill day filter', () => {
		render(MonthlyAssignmentPlanner, {
			props: {
				currentDate: new Date(2026, 9, 1),
				onDateChange: vi.fn(),
				rangeStatus: 'ready',
				onRetry: vi.fn(),
				assignmentTypes: [staffDuty],
				assignments: [],
				personnelByGroup: [],
				groups: [],
				onSetAssignment: vi.fn(),
				onSetAssignmentBatch: vi.fn()
			}
		});

		const table = screen.getByRole('table', { name: 'October 2026 assignments' });
		expect(
			within(table)
				.getAllByRole('columnheader')
				.map((header) => header.textContent?.trim())
		).toEqual(['Date', 'Day', 'SD']);
		expect(within(table).getAllByRole('row')).toHaveLength(32);
		expect((screen.getByRole('combobox', { name: 'Quick Fill days' }) as HTMLSelectElement).value).toBe('weekdays');
	});
});
