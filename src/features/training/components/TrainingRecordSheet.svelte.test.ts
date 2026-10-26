// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Personnel } from '$features/personnel/contracts';
import type { PersonnelTraining, TrainingType } from '$features/training/training.types';
const navigationGuard = vi.hoisted(() => ({ current: null as null | ((navigation: { cancel: () => void }) => void) }));
vi.mock('$app/navigation', () => ({
	beforeNavigate: (guard: (navigation: { cancel: () => void }) => void) => (navigationGuard.current = guard)
}));

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
		canExempt: true,
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

	it('leaves no form open on a row that moved to Current after Record all', async () => {
		render(TrainingRecordSheet, { props: props() });
		expect(await screen.findByRole('button', { name: 'Save' })).toBeTruthy();

		await fireEvent.click(screen.getByRole('button', { name: 'Record all 2 today' }));
		await fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Record 2' }));

		await waitFor(() => expect(screen.queryByRole('button', { name: 'Save' })).toBeNull());
	});

	it('exempts a Soldier from a type that allows it, and takes the exemption back', async () => {
		const onToggleExempt = vi.fn().mockResolvedValue(undefined);
		const user = userEvent.setup();
		const exemptable = type('fit', 'Fitness', { canBeExempted: true });
		const { rerender } = render(TrainingRecordSheet, {
			props: props({ trainingTypes: [exemptable], trainings: [], onToggleExempt })
		});

		await user.click(await screen.findByRole('button', { name: 'More actions for Fitness' }));
		await user.click(await screen.findByRole('menuitem', { name: 'Exempt' }));
		expect(onToggleExempt).toHaveBeenLastCalledWith('fit', true);

		await rerender(
			props({
				trainingTypes: [{ ...exemptable, exemptPersonnelIds: ['p1'] }],
				trainings: [],
				onToggleExempt
			})
		);
		await user.click(await screen.findByRole('button', { name: 'More actions for Fitness' }));
		await user.click(await screen.findByRole('menuitem', { name: 'Unexempt' }));
		expect(onToggleExempt).toHaveBeenLastCalledWith('fit', false);
	});

	it('removes the record behind a row only after the confirm', async () => {
		const onRemove = vi.fn().mockResolvedValue(undefined);
		const user = userEvent.setup();
		render(TrainingRecordSheet, { props: props({ onRemove }) });

		await user.click(await screen.findByRole('button', { name: 'More actions for Safety' }));
		await user.click(await screen.findByRole('menuitem', { name: 'Delete' }));
		expect(onRemove).not.toHaveBeenCalled();
		await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Delete' }));

		await waitFor(() => expect(onRemove).toHaveBeenCalledOnce());
		expect(onRemove.mock.calls[0][0]).toBe('r-ok');
	});

	describe('correcting a record', () => {
		it('renews an expired record from today when saved from its open form', async () => {
			const onSave = vi.fn().mockResolvedValue(undefined);
			const user = userEvent.setup();
			render(TrainingRecordSheet, { props: props({ onSave }) });

			await user.click(await screen.findByRole('button', { name: 'Save' }));

			await waitFor(() =>
				expect(onSave).toHaveBeenCalledExactlyOnceWith(
					expect.objectContaining({ trainingTypeId: 'bls', completionDate: '2026-10-25', expirationDate: '2027-10-25' })
				)
			);
		});

		it('keeps the stored completion date when only a note changes', async () => {
			const onSave = vi.fn().mockResolvedValue(undefined);
			const user = userEvent.setup();
			render(TrainingRecordSheet, { props: props({ onSave }) });
			await user.click(await screen.findByRole('button', { name: 'More actions for Safety' }));
			await user.click(await screen.findByRole('menuitem', { name: 'Edit' }));
			await user.click(await screen.findByRole('button', { name: /Add a note or certificate link/ }));
			await user.type(screen.getByLabelText('Notes'), 'Re-scanned certificate');

			await user.click(screen.getByRole('button', { name: 'Save' }));

			await waitFor(() =>
				expect(onSave).toHaveBeenCalledExactlyOnceWith({
					personnelId: 'p1',
					trainingTypeId: 'ok',
					completionDate: '2026-10-06',
					expirationDate: '2027-10-06',
					notes: 'Re-scanned certificate',
					certificateUrl: null
				})
			);
		});

		it('does not fill in today for a record saved without a completion date', async () => {
			const onSave = vi.fn().mockResolvedValue(undefined);
			const user = userEvent.setup();
			const undated = trainings.map((record) => (record.id === 'r-ok' ? { ...record, completionDate: null } : record));
			render(TrainingRecordSheet, { props: props({ onSave, trainings: undated }) });
			await user.click(await screen.findByRole('button', { name: 'More actions for Safety' }));
			await user.click(await screen.findByRole('menuitem', { name: 'Edit' }));

			await user.click(await screen.findByRole('button', { name: 'Save' }));

			expect(onSave).not.toHaveBeenCalled();
		});

		it('saves a note on a never-expiring record stored without a date, keeping it undated', async () => {
			const onSave = vi.fn().mockResolvedValue(undefined);
			const user = userEvent.setup();
			const stored: PersonnelTraining = {
				id: 'r-never',
				personnelId: 'p1',
				trainingTypeId: 'never',
				completionDate: null,
				expirationDate: null,
				notes: null,
				certificateUrl: null
			};
			render(TrainingRecordSheet, {
				props: props({
					onSave,
					trainingTypes: [...types, type('never', 'Orientation', { sortOrder: 5, expirationMonths: null })],
					trainings: [...trainings, stored]
				})
			});
			await user.click(await screen.findByRole('button', { name: 'More actions for Orientation' }));
			await user.click(await screen.findByRole('menuitem', { name: 'Edit' }));
			await user.click(await screen.findByRole('button', { name: /Add a note or certificate link/ }));
			await user.type(screen.getByLabelText('Notes'), 'Briefed');

			await user.click(screen.getByRole('button', { name: 'Save' }));

			await waitFor(() =>
				expect(onSave).toHaveBeenCalledExactlyOnceWith({
					personnelId: 'p1',
					trainingTypeId: 'never',
					completionDate: null,
					expirationDate: null,
					notes: 'Briefed',
					certificateUrl: null
				})
			);
		});

		it('keeps the stored card date when only a note changes', async () => {
			const onSave = vi.fn().mockResolvedValue(undefined);
			const user = userEvent.setup();
			const stored: PersonnelTraining = {
				id: 'r-card',
				personnelId: 'p1',
				trainingTypeId: 'card',
				completionDate: null,
				expirationDate: '2027-03-15',
				notes: null,
				certificateUrl: null
			};
			render(TrainingRecordSheet, { props: props({ onSave, trainings: [...trainings, stored] }) });
			await user.click(await screen.findByRole('button', { name: 'More actions for Driver card' }));
			await user.click(await screen.findByRole('menuitem', { name: 'Edit' }));
			await user.click(await screen.findByRole('button', { name: /Add a note or certificate link/ }));
			await user.type(screen.getByLabelText('Notes'), 'Renewed');

			await user.click(screen.getByRole('button', { name: 'Save' }));

			await waitFor(() =>
				expect(onSave).toHaveBeenCalledExactlyOnceWith({
					personnelId: 'p1',
					trainingTypeId: 'card',
					completionDate: null,
					expirationDate: '2027-03-15',
					notes: 'Renewed',
					certificateUrl: null
				})
			);
		});
	});

	describe('saving from the form', () => {
		it('keeps a saving form open when another item is chosen, so its refusal still shows', async () => {
			const user = userEvent.setup();
			let refuse!: (error: Error) => void;
			const onSave = vi.fn(() => new Promise<void>((_resolve, reject) => (refuse = reject)));
			render(TrainingRecordSheet, { props: props({ onSave }) });
			await user.click(await screen.findByRole('button', { name: 'Save' }));

			await user.click(screen.getByRole('button', { name: /^CPR/ }));
			refuse(new Error('Server said no'));

			expect(await screen.findByText(/Server said no/)).toBeTruthy();
			expect(screen.getByRole('button', { name: /^BLS/ }).getAttribute('aria-expanded')).toBe('true');
			expect(screen.getByRole('button', { name: /^CPR/ }).getAttribute('aria-expanded')).toBe('false');
		});

		it('keeps the draft and shows the error when a renewal the store already applied is refused', async () => {
			const user = userEvent.setup();
			const onSave = vi.fn(async (data: Omit<PersonnelTraining, 'id'>) => {
				await rerender(
					props({
						onSave,
						trainings: [...trainings.filter((record) => record.id !== 'r-bls'), { id: 'temp', ...data }]
					})
				);
				await rerender(props({ onSave }));
				throw new Error('Server said no');
			});
			const { rerender } = render(TrainingRecordSheet, { props: props({ onSave }) });
			await user.click(await screen.findByRole('button', { name: /Add a note or certificate link/ }));
			await user.type(screen.getByLabelText('Notes'), 'Draft note');

			await user.click(screen.getByRole('button', { name: 'Save' }));

			expect(await screen.findByText(/Server said no/)).toBeTruthy();
			expect((screen.getByLabelText('Notes') as HTMLTextAreaElement).value).toBe('Draft note');
		});

		it('holds a form save back while another save is in flight', async () => {
			const user = userEvent.setup();
			const onSave = vi.fn().mockImplementation(() => new Promise(() => {}));
			render(TrainingRecordSheet, { props: props({ onSave }) });
			await user.click(await screen.findByRole('button', { name: 'Record CPR today' }));

			await waitFor(() =>
				expect((screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement).disabled).toBe(true)
			);
			expect(onSave).toHaveBeenCalledOnce();
		});
	});

	describe('leaving a draft', () => {
		async function dirtyFirstForm(user: ReturnType<typeof userEvent.setup>) {
			await user.click(await screen.findByRole('button', { name: /Add a note or certificate link/ }));
			await user.type(screen.getByLabelText('Notes'), 'Draft note');
		}

		it('asks before opening another item, and keeps the draft when the answer is no', async () => {
			const user = userEvent.setup();
			render(TrainingRecordSheet, { props: props() });
			await dirtyFirstForm(user);

			await user.click(screen.getByRole('button', { name: /^CPR/ }));
			const confirm = await screen.findByRole('alertdialog');
			await user.click(within(confirm).getByRole('button', { name: 'Cancel' }));

			expect((screen.getByLabelText('Notes') as HTMLTextAreaElement).value).toBe('Draft note');
			expect(screen.getByRole('button', { name: /^BLS/ }).getAttribute('aria-expanded')).toBe('true');
		});

		it('opens the other item once the draft is discarded', async () => {
			const user = userEvent.setup();
			render(TrainingRecordSheet, { props: props() });
			await dirtyFirstForm(user);

			await user.click(screen.getByRole('button', { name: /^CPR/ }));
			await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Discard' }));

			await waitFor(() =>
				expect(screen.getByRole('button', { name: /^CPR/ }).getAttribute('aria-expanded')).toBe('true')
			);
			expect(screen.queryByDisplayValue('Draft note')).toBeNull();
		});

		it('opens another item without asking when nothing was typed', async () => {
			const user = userEvent.setup();
			render(TrainingRecordSheet, { props: props() });
			await screen.findByRole('button', { name: 'Save' });

			await user.click(screen.getByRole('button', { name: /^CPR/ }));

			expect(screen.queryByRole('alertdialog')).toBeNull();
			expect(screen.getByRole('button', { name: /^CPR/ }).getAttribute('aria-expanded')).toBe('true');
		});

		it('cancels navigation away while a form has unsaved changes', async () => {
			const user = userEvent.setup();
			render(TrainingRecordSheet, { props: props() });
			await dirtyFirstForm(user);
			const cancel = vi.fn();

			navigationGuard.current?.({ cancel });

			expect(cancel).toHaveBeenCalledOnce();
			expect(screen.getByRole('link', { name: 'Open profile' }).getAttribute('aria-disabled')).toBe('true');
		});

		it('cancels navigation away while a save is in flight', async () => {
			const user = userEvent.setup();
			const onSave = vi.fn().mockImplementation(() => new Promise(() => {}));
			render(TrainingRecordSheet, { props: props({ onSave }) });
			await user.click(await screen.findByRole('button', { name: 'Record CPR today' }));
			const cancel = vi.fn();

			navigationGuard.current?.({ cancel });

			expect(cancel).toHaveBeenCalledOnce();
		});

		it('cancels navigation away while a delete is in flight', async () => {
			const user = userEvent.setup();
			const onRemove = vi.fn().mockImplementation(() => new Promise(() => {}));
			render(TrainingRecordSheet, { props: props({ onRemove }) });
			await user.click(await screen.findByRole('button', { name: 'More actions for Safety' }));
			await user.click(await screen.findByRole('menuitem', { name: 'Delete' }));
			await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Delete' }));
			await waitFor(() => expect(onRemove).toHaveBeenCalledOnce());
			const cancel = vi.fn();

			navigationGuard.current?.({ cancel });

			expect(cancel).toHaveBeenCalledOnce();
		});

		it('lets navigation go when nothing is pending', async () => {
			render(TrainingRecordSheet, { props: props() });
			await screen.findByRole('dialog');
			const cancel = vi.fn();

			navigationGuard.current?.({ cancel });

			expect(cancel).not.toHaveBeenCalled();
			expect(screen.getByRole('link', { name: 'Open profile' }).getAttribute('aria-disabled')).not.toBe('true');
		});
	});

	describe('exempting', () => {
		const exemptable = type('fit', 'Fitness', { canBeExempted: true });

		it('offers neither Exempt nor Unexempt to someone who cannot configure types', async () => {
			const user = userEvent.setup();
			const { rerender } = render(TrainingRecordSheet, {
				props: props({ trainingTypes: [exemptable], trainings: [], canExempt: false })
			});

			await user.click(await screen.findByRole('button', { name: 'More actions for Fitness' }));
			expect(await screen.findByRole('menuitem', { name: 'Add record' })).toBeTruthy();
			expect(screen.queryByRole('menuitem', { name: 'Exempt' })).toBeNull();
			await user.keyboard('{Escape}');

			await rerender(
				props({
					trainingTypes: [{ ...exemptable, exemptPersonnelIds: ['p1'] }],
					trainings: [],
					canExempt: false
				})
			);
			expect(screen.queryByRole('button', { name: 'More actions for Fitness' })).toBeNull();
		});
	});
});
