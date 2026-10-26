// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Personnel } from '$features/personnel/contracts';
import type { PersonnelTraining, TrainingType } from '$features/training/training.types';
import TrainingRecordSheet from './TrainingRecordSheet.svelte';

const ASOF = '2026-10-25';

const person: Personnel = {
	id: 'p1',
	rank: 'PFC',
	lastName: 'Brooks',
	firstName: 'Jalen',
	mos: '92Y',
	clinicRole: 'Supply',
	groupId: 'g1',
	groupName: 'Alpha'
};
const other: Personnel = { ...person, id: 'p2', lastName: 'Adams' };

function type(id: string, name: string, overrides: Partial<TrainingType> = {}): TrainingType {
	return {
		id,
		name,
		description: null,
		expirationMonths: 12,
		warningDaysYellow: 60,
		warningDaysOrange: 30,
		appliesToRoles: [],
		appliesToMos: [],
		appliesToRanks: [],
		excludedRoles: [],
		excludedMos: [],
		excludedRanks: [],
		color: '#000000',
		sortOrder: 0,
		expirationDateOnly: false,
		canBeExempted: false,
		exemptPersonnelIds: [],
		isOptional: false,
		...overrides
	};
}

const types = [
	type('bls', 'BLS', { sortOrder: 0 }),
	type('cpr', 'CPR', { sortOrder: 1 }),
	type('card', 'Driver card', { sortOrder: 2, expirationDateOnly: true }),
	type('ok', 'Safety', { sortOrder: 3 }),
	type('drivers', 'Convoy', { sortOrder: 4, appliesToRoles: ['Driver'] })
];

const trainings: PersonnelTraining[] = [
	{
		id: 'r-bls',
		personnelId: 'p1',
		trainingTypeId: 'bls',
		completionDate: '2025-08-04',
		expirationDate: '2026-08-04',
		notes: null,
		certificateUrl: null
	},
	{
		id: 'r-ok',
		personnelId: 'p1',
		trainingTypeId: 'ok',
		completionDate: '2026-10-06',
		expirationDate: '2027-10-06',
		notes: null,
		certificateUrl: null
	}
];

function props(overrides: Record<string, unknown> = {}) {
	return {
		person,
		trainingTypes: types,
		trainings,
		orgId: 'org-1',
		asOf: ASOF,
		loading: false,
		profileHref: '/org/org-1/personnel/brooks',
		canStep: { previous: true, next: true },
		onStep: vi.fn(),
		onSave: vi.fn().mockResolvedValue(undefined),
		onSaveBatch: vi.fn().mockResolvedValue(undefined),
		onRemove: vi.fn().mockResolvedValue(undefined),
		onToggleExempt: vi.fn().mockResolvedValue(undefined),
		onClose: vi.fn(),
		...overrides
	};
}

afterEach(cleanup);

describe('TrainingRecordSheet', () => {
	it('records Today on the Organization day, with the type interval applied', async () => {
		const onSave = vi.fn().mockResolvedValue(undefined);
		render(TrainingRecordSheet, { props: props({ onSave }) });

		await fireEvent.click(await screen.findByRole('button', { name: 'Record CPR today' }));

		await waitFor(() =>
			expect(onSave).toHaveBeenCalledExactlyOnceWith({
				personnelId: 'p1',
				trainingTypeId: 'cpr',
				completionDate: '2026-10-25',
				expirationDate: '2027-10-25',
				notes: null,
				certificateUrl: null
			})
		);
	});

	it('asks for the card date instead of offering Today on a card-date type', async () => {
		render(TrainingRecordSheet, { props: props() });

		expect(await screen.findByRole('button', { name: 'Enter the card date for Driver card' })).toBeTruthy();
		expect(screen.queryByRole('button', { name: 'Record Driver card today' })).toBeNull();
	});

	it('records every Needs action type except card-date ones after the confirm states the count', async () => {
		const onSaveBatch = vi.fn().mockResolvedValue(undefined);
		render(TrainingRecordSheet, { props: props({ onSaveBatch }) });

		await fireEvent.click(await screen.findByRole('button', { name: 'Record all 2 today' }));
		const confirm = await screen.findByRole('alertdialog');
		expect(within(confirm).getByText(/2 trainings/)).toBeTruthy();
		expect(within(confirm).getByText(/card/i)).toBeTruthy();
		await fireEvent.click(within(confirm).getByRole('button', { name: 'Record 2' }));

		await waitFor(() => expect(onSaveBatch).toHaveBeenCalledOnce());
		const records = onSaveBatch.mock.calls[0][0] as Array<{ trainingTypeId: string; completionDate: string }>;
		expect(records.map((record) => record.trainingTypeId).sort()).toEqual(['bls', 'cpr']);
		expect(new Set(records.map((record) => record.completionDate))).toEqual(new Set([ASOF]));
	});

	it('steps with the arrow keys and stops at the ends of the matrix order', async () => {
		const onStep = vi.fn();
		const { rerender } = render(TrainingRecordSheet, { props: props({ onStep }) });
		const sheet = await screen.findByRole('dialog');

		await fireEvent.keyDown(sheet, { key: 'ArrowDown' });
		await fireEvent.keyDown(sheet, { key: 'ArrowUp' });
		expect(onStep.mock.calls).toEqual([[1], [-1]]);

		onStep.mockClear();
		await rerender(props({ onStep, canStep: { previous: false, next: false } }));
		await fireEvent.keyDown(sheet, { key: 'ArrowDown' });
		await fireEvent.keyDown(sheet, { key: 'ArrowUp' });
		expect(onStep).not.toHaveBeenCalled();
	});

	it('does not step while the arrow keys move inside a text field', async () => {
		const onStep = vi.fn();
		const user = userEvent.setup();
		render(TrainingRecordSheet, { props: props({ onStep }) });
		await user.click(await screen.findByRole('button', { name: /Add a note or certificate link/ }));

		await user.type(screen.getByLabelText('Notes'), 'ab{ArrowUp}{ArrowDown}');

		expect(onStep).not.toHaveBeenCalled();
	});

	it('keeps the sheet open and stepping disabled while a form has unsaved changes', async () => {
		const onStep = vi.fn();
		const onClose = vi.fn();
		const user = userEvent.setup();
		render(TrainingRecordSheet, { props: props({ onStep, onClose }) });
		await user.click(await screen.findByRole('button', { name: /Add a note or certificate link/ }));
		await user.type(screen.getByLabelText('Notes'), 'draft');

		await user.keyboard('{Escape}');
		await fireEvent.keyDown(screen.getByRole('dialog'), { key: 'ArrowDown' });

		expect(onClose).not.toHaveBeenCalled();
		expect(onStep).not.toHaveBeenCalled();
		expect((screen.getByRole('button', { name: 'Next Soldier' }) as HTMLButtonElement).disabled).toBe(true);
	});

	it('closes on Escape when nothing is unsaved', async () => {
		const onClose = vi.fn();
		const user = userEvent.setup();
		render(TrainingRecordSheet, { props: props({ onClose }) });
		await screen.findByRole('dialog');

		await user.keyboard('{Escape}');

		expect(onClose).toHaveBeenCalledOnce();
	});

	it('links Open profile to the Personnel page', async () => {
		render(TrainingRecordSheet, { props: props() });

		const link = await screen.findByRole('link', { name: 'Open profile' });

		expect(link.getAttribute('href')).toBe('/org/org-1/personnel/brooks');
	});

	it('shows a skeleton instead of items while its sources load', async () => {
		render(TrainingRecordSheet, { props: props({ loading: true }) });

		expect(await screen.findByRole('status', { name: 'Loading training items' })).toBeTruthy();
		expect(screen.queryByRole('button', { name: 'Record CPR today' })).toBeNull();
	});

	it('reports a refused Today save on the sheet it was made from', async () => {
		const onSave = vi.fn().mockRejectedValue(new Error('Server said no'));
		render(TrainingRecordSheet, { props: props({ onSave }) });

		await fireEvent.click(await screen.findByRole('button', { name: 'Record CPR today' }));

		expect(await screen.findByText(/Server said no/)).toBeTruthy();
	});

	it('drops a refused save that finishes after the sheet moved to another Soldier', async () => {
		let refuse!: (error: Error) => void;
		const onSave = vi.fn().mockImplementation(() => new Promise((_, reject) => (refuse = reject)));
		const { rerender } = render(TrainingRecordSheet, { props: props({ onSave }) });
		await fireEvent.click(await screen.findByRole('button', { name: 'Record CPR today' }));

		await rerender(props({ onSave, person: other }));
		refuse(new Error('Server said no'));

		await waitFor(() =>
			expect((screen.getByRole('button', { name: 'Record CPR today' }) as HTMLButtonElement).disabled).toBe(false)
		);
		expect(screen.queryByText(/Server said no/)).toBeNull();
	});

	it('drops a refused save that finishes after the sheet moved to another Organization', async () => {
		let refuse!: (error: Error) => void;
		const onSave = vi.fn().mockImplementation(() => new Promise((_, reject) => (refuse = reject)));
		const { rerender } = render(TrainingRecordSheet, { props: props({ onSave }) });
		await fireEvent.click(await screen.findByRole('button', { name: 'Record CPR today' }));

		await rerender(props({ onSave, orgId: 'org-2' }));
		refuse(new Error('Server said no'));

		await waitFor(() =>
			expect((screen.getByRole('button', { name: 'Record CPR today' }) as HTMLButtonElement).disabled).toBe(false)
		);
		expect(screen.queryByText(/Server said no/)).toBeNull();
	});
});
