// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import TrainingRecordModal from './TrainingRecordModal.svelte';
import type { Personnel } from '$features/personnel/contracts';
import type { TrainingType } from '$features/training/training.types';
import { toast } from 'svelte-sonner';
import { tick } from 'svelte';

const person: Personnel = {
	id: 'person-1',
	rank: 'SGT',
	lastName: 'Smith',
	firstName: 'Jane',
	mos: '68W',
	clinicRole: 'Medic',
	groupId: null,
	groupName: ''
};

const trainingType: TrainingType = {
	id: 'type-1',
	name: 'CPR',
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
	color: '#22c55e',
	sortOrder: 0,
	expirationDateOnly: false,
	canBeExempted: false,
	exemptPersonnelIds: [],
	isOptional: false
};

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
});

describe('TrainingRecordModal', () => {
	it('keeps the record draft and confirmation after failed deletion, then closes after retry', async () => {
		const onRemove = vi.fn().mockRejectedValueOnce(new Error('Removal failed')).mockResolvedValueOnce(undefined);
		const onClose = vi.fn();
		const errorToast = vi.spyOn(toast, 'error').mockImplementation(() => 'error');
		render(TrainingRecordModal, {
			props: {
				person,
				trainingType,
				existingTraining: {
					id: 'record-1',
					personnelId: person.id,
					trainingTypeId: trainingType.id,
					completionDate: '2026-01-05',
					expirationDate: '2027-01-05',
					notes: 'Saved notes',
					certificateUrl: null
				},
				onSave: vi.fn(),
				onRemove,
				onClose
			}
		});
		await fireEvent.input(screen.getByLabelText('Notes (optional)'), { target: { value: 'Unsaved draft' } });
		await fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
		await fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Delete' }));
		await waitFor(() => expect(errorToast).toHaveBeenCalled());
		expect(onClose).not.toHaveBeenCalled();
		expect((screen.getByLabelText('Notes (optional)') as HTMLTextAreaElement).value).toBe('Unsaved draft');
		expect(screen.getByRole('alertdialog')).toBeTruthy();
		await fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Delete' }));
		await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
		expect(onRemove.mock.calls.map(([id]) => id)).toEqual(['record-1', 'record-1']);
	});

	it('ignores repeated save clicks while a save is already pending', async () => {
		let resolveSave!: () => void;
		const onSave = vi.fn(
			() =>
				new Promise<void>((resolve) => {
					resolveSave = resolve;
				})
		);

		render(TrainingRecordModal, {
			props: {
				person,
				trainingType,
				existingTraining: undefined,
				onSave,
				onRemove: vi.fn(),
				onClose: vi.fn()
			}
		});

		const saveButton = screen.getByTestId('training-save');
		await fireEvent.click(saveButton);
		await fireEvent.click(saveButton);

		expect(onSave).toHaveBeenCalledTimes(1);
		expect((saveButton as HTMLButtonElement).disabled).toBe(true);
		expect(saveButton.textContent).toContain('Saving');

		resolveSave();
	});

	it.each(['success', 'failure'] as const)('keeps a disposed record editor quiet after a late %s', async (outcome) => {
		let resolveSave!: () => void;
		let rejectSave!: (error: Error) => void;
		const pendingSave = new Promise<void>((resolve, reject) => {
			resolveSave = resolve;
			rejectSave = reject;
		});
		const successToast = vi.spyOn(toast, 'success').mockImplementation(() => 'success');
		const errorToast = vi.spyOn(toast, 'error').mockImplementation(() => 'error');
		const onClose = vi.fn();
		const view = render(TrainingRecordModal, {
			props: {
				person,
				trainingType,
				existingTraining: {
					id: 'record-1',
					personnelId: person.id,
					trainingTypeId: trainingType.id,
					completionDate: '2026-01-05',
					expirationDate: '2027-01-05',
					notes: 'Organization A original',
					certificateUrl: null
				},
				onSave: () => pendingSave,
				onRemove: vi.fn(),
				onClose
			}
		});
		await fireEvent.click(screen.getByRole('button', { name: 'Save' }));
		expect(screen.getByRole('button', { name: 'Saving...' }).hasAttribute('disabled')).toBe(true);
		await view.unmount();

		if (outcome === 'success') resolveSave();
		else rejectSave(new Error('Retired response'));
		await tick();

		expect({
			success: successToast.mock.calls.length,
			error: errorToast.mock.calls.length,
			close: onClose.mock.calls.length
		}).toEqual({ success: 0, error: 0, close: 0 });
	});

	it.each(['success', 'failure'] as const)('keeps a disposed record removal quiet after a late %s', async (outcome) => {
		let resolveRemove!: () => void;
		let rejectRemove!: (error: Error) => void;
		const pendingRemove = new Promise<void>((resolve, reject) => {
			resolveRemove = resolve;
			rejectRemove = reject;
		});
		const errorToast = vi.spyOn(toast, 'error').mockImplementation(() => 'error');
		const onClose = vi.fn();
		const view = render(TrainingRecordModal, {
			props: {
				person,
				trainingType,
				existingTraining: {
					id: 'record-1',
					personnelId: person.id,
					trainingTypeId: trainingType.id,
					completionDate: '2026-01-05',
					expirationDate: '2027-01-05',
					notes: 'Organization A original',
					certificateUrl: null
				},
				onSave: vi.fn(),
				onRemove: () => pendingRemove,
				onClose
			}
		});
		await fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
		await fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Delete' }));
		await view.unmount();

		if (outcome === 'success') resolveRemove();
		else rejectRemove(new Error('Retired removal'));
		await tick();

		expect({ error: errorToast.mock.calls.length, close: onClose.mock.calls.length }).toEqual({ error: 0, close: 0 });
	});
});
