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
});
