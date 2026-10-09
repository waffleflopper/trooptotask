// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import PersonTrainingEditor from './PersonTrainingEditor.svelte';
import type { Personnel } from '$features/personnel/contracts';
import type { PersonnelTraining, TrainingType } from '$features/training/training.types';
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
} as unknown as Personnel;

const expiringType: TrainingType = {
	id: 'type-expiring',
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

const neverExpiresType: TrainingType = {
	...expiringType,
	id: 'type-never-expires',
	name: 'Orientation',
	expirationMonths: null,
	sortOrder: 1
};

const expirationDateOnlyType: TrainingType = {
	...expiringType,
	id: 'type-expiration-only',
	name: 'License',
	expirationDateOnly: true,
	sortOrder: 2
};

const trainingTypes = [expiringType, neverExpiresType, expirationDateOnlyType];
const savedRecord: PersonnelTraining = {
	id: 'saved-record',
	personnelId: person.id,
	trainingTypeId: neverExpiresType.id,
	completionDate: null,
	expirationDate: null,
	notes: 'Saved notes',
	certificateUrl: 'https://example.test/saved'
};

function renderEditor(
	overrides: {
		onSave?: (data: Omit<PersonnelTraining, 'id'>) => Promise<void>;
		onSaveBatch?: (
			records: Array<{
				personnelId: string;
				trainingTypeId: string;
				completionDate: string | null;
				notes?: string;
				status: 'completed';
			}>
		) => Promise<void>;
	} = {}
) {
	return render(PersonTrainingEditor, {
		props: {
			person,
			trainingTypes,
			trainings: [],
			onSave: overrides.onSave ?? vi.fn().mockResolvedValue(undefined),
			onSaveBatch: overrides.onSaveBatch,
			onRemove: vi.fn(),
			onClose: vi.fn()
		}
	});
}

async function confirmMarkAllCompleted() {
	await fireEvent.click(screen.getByRole('button', { name: 'Mark All Completed Today' }));
	await fireEvent.click(await screen.findByRole('button', { name: 'Mark All' }));
}

beforeEach(() => {
	vi.useFakeTimers();
	vi.setSystemTime(new Date(2026, 3, 6, 12, 0, 0));
});

afterEach(() => {
	cleanup();
	vi.useRealTimers();
	vi.restoreAllMocks();
});

describe('PersonTrainingEditor', () => {
	it('discards the previous person draft when another person is selected', async () => {
		vi.useRealTimers();
		const view = renderEditor();
		await view.rerender({ trainingTypes: [neverExpiresType], trainings: [savedRecord] });
		await fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
		await fireEvent.input(screen.getByLabelText('Notes'), { target: { value: 'Previous person draft' } });
		await view.rerender({ person: { ...person, id: 'another-person' } });
		expect(screen.queryByLabelText('Notes')).toBeNull();
		await fireEvent.click(screen.getByRole('button', { name: 'Add' }));
		expect((screen.getByLabelText('Notes') as HTMLInputElement).value).toBe('');
	});

	it('suppresses rejected save feedback after the editor closes', async () => {
		vi.useRealTimers();
		let rejectSave!: (error: Error) => void;
		const onSave = vi.fn(
			() =>
				new Promise<void>((_, reject) => {
					rejectSave = reject;
				})
		);
		const errorToast = vi.spyOn(toast, 'error').mockImplementation(() => 'error');
		const view = renderEditor({ onSave });
		await view.rerender({ trainingTypes: [neverExpiresType], trainings: [savedRecord] });
		await fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Save' }));
		view.unmount();
		rejectSave(new Error('Retired save denied'));
		await onSave.mock.results[0].value.catch(() => undefined);
		await Promise.resolve();
		expect(errorToast).not.toHaveBeenCalled();
	});

	it('retains an inline draft during record refresh and retries a rejected save', async () => {
		vi.useRealTimers();
		let rejectSave!: (error: Error) => void;
		const pendingSave = new Promise<void>((_, reject) => {
			rejectSave = reject;
		});
		const onSave = vi.fn().mockReturnValueOnce(pendingSave).mockResolvedValueOnce(undefined);
		const errorToast = vi.spyOn(toast, 'error').mockImplementation(() => 'error');
		const record = savedRecord;
		const view = render(PersonTrainingEditor, {
			props: {
				person,
				trainingTypes: [neverExpiresType],
				trainings: [record],
				onSave,
				onRemove: vi.fn(),
				onClose: vi.fn()
			}
		});
		await fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
		await fireEvent.input(screen.getByLabelText('Notes'), { target: { value: 'Retained draft' } });
		await fireEvent.input(screen.getByLabelText('Certificate URL'), {
			target: { value: 'https://example.test/draft' }
		});
		await fireEvent.click(screen.getByRole('button', { name: 'Save' }));
		await view.rerender({ trainings: [{ ...record, id: 'pending-record', notes: 'Retained draft' }] });
		rejectSave(new Error('Save denied'));
		await view.rerender({ trainings: [record] });
		await waitFor(() => expect(errorToast).toHaveBeenCalled());
		expect((screen.getByLabelText('Notes') as HTMLInputElement).value).toBe('Retained draft');
		expect((screen.getByLabelText('Certificate URL') as HTMLInputElement).value).toBe('https://example.test/draft');
		await fireEvent.click(screen.getByRole('button', { name: 'Save' }));
		await waitFor(() => expect(screen.queryByLabelText('Notes')).toBeNull());
		expect(onSave.mock.calls.map(([data]) => data)).toEqual([
			{
				personnelId: person.id,
				trainingTypeId: neverExpiresType.id,
				completionDate: null,
				expirationDate: null,
				notes: 'Retained draft',
				certificateUrl: 'https://example.test/draft'
			},
			{
				personnelId: person.id,
				trainingTypeId: neverExpiresType.id,
				completionDate: null,
				expirationDate: null,
				notes: 'Retained draft',
				certificateUrl: 'https://example.test/draft'
			}
		]);
	});

	// happy-dom does not apply a disabled fieldset to its controls' :disabled state.
	const inDisabledGroup = (control: HTMLElement) => control.closest('fieldset')?.disabled === true;

	function renderHeldSave(onSave: (data: Omit<PersonnelTraining, 'id'>) => Promise<void>) {
		render(PersonTrainingEditor, {
			props: {
				person,
				trainingTypes: [neverExpiresType, expiringType],
				trainings: [savedRecord],
				onSave,
				onRemove: vi.fn(),
				onClose: vi.fn()
			}
		});
		return screen.getByRole('dialog', { name: 'Training Records' });
	}

	it('holds a draft save busy with the draft locked, ignores a repeat save and keeps the draft on failure', async () => {
		vi.useRealTimers();
		let rejectSave!: (error: Error) => void;
		const onSave = vi.fn(
			() =>
				new Promise<void>((_, reject) => {
					rejectSave = reject;
				})
		);
		const errorToast = vi.spyOn(toast, 'error').mockImplementation(() => 'error');
		const dialog = renderHeldSave(onSave);
		await fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
		await fireEvent.input(screen.getByLabelText('Notes'), { target: { value: 'Draft A' } });
		const save = screen.getByRole('button', { name: 'Save' });

		await fireEvent.click(save);
		await fireEvent.click(save);

		expect(onSave).toHaveBeenCalledTimes(1);
		expect(dialog.getAttribute('aria-busy')).toBe('true');
		for (const control of [
			screen.getByLabelText('Notes'),
			screen.getByLabelText('Certificate URL'),
			screen.getByRole('button', { name: 'Cancel' }),
			screen.getByRole('button', { name: 'Today' }),
			screen.getByRole('button', { name: 'Mark All Completed Today' })
		]) {
			expect(inDisabledGroup(control)).toBe(true);
		}
		expect((screen.getByRole('button', { name: 'Close' }) as HTMLButtonElement).disabled).toBe(true);
		await fireEvent.keyDown(dialog, { key: 'Escape' });
		expect(screen.getByRole('dialog', { name: 'Training Records' })).toBe(dialog);

		rejectSave(new Error('Save denied'));

		await waitFor(() => expect(dialog.hasAttribute('aria-busy')).toBe(false));
		expect(errorToast).toHaveBeenCalledWith('Save denied', { duration: 6000 });
		const notes = screen.getByLabelText('Notes') as HTMLInputElement;
		expect(notes.value).toBe('Draft A');
		expect(inDisabledGroup(notes)).toBe(false);
	});

	it('saves the draft it started with and leaves no newer draft to lose', async () => {
		vi.useRealTimers();
		let resolveSave!: () => void;
		const onSave = vi.fn(
			(_data: Omit<PersonnelTraining, 'id'>) =>
				new Promise<void>((resolve) => {
					resolveSave = resolve;
				})
		);
		const dialog = renderHeldSave(onSave);
		await fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
		await fireEvent.input(screen.getByLabelText('Notes'), { target: { value: 'Draft A' } });
		await fireEvent.click(screen.getByRole('button', { name: 'Save' }));

		expect(inDisabledGroup(screen.getByLabelText('Notes'))).toBe(true);

		resolveSave();

		await waitFor(() => expect(dialog.hasAttribute('aria-busy')).toBe(false));
		expect(screen.queryByLabelText('Notes')).toBeNull();
		expect(onSave.mock.calls.map(([data]) => data.notes)).toEqual(['Draft A']);
	});

	it('keeps the Mark All confirmation busy until the batch settles and open for a retry after failure', async () => {
		vi.useRealTimers();
		const settles: Array<{ resolve: () => void; reject: (error: Error) => void }> = [];
		const onSaveBatch = vi.fn(() => new Promise<void>((resolve, reject) => settles.push({ resolve, reject })));
		const errorToast = vi.spyOn(toast, 'error').mockImplementation(() => 'error');
		renderEditor({ onSaveBatch });
		const editor = screen.getByRole('dialog', { name: 'Training Records' });

		await fireEvent.click(screen.getByRole('button', { name: 'Mark All Completed Today' }));
		const confirmation = screen.getByRole('alertdialog');
		const markAll = within(confirmation).getByRole('button', { name: 'Mark All' }) as HTMLButtonElement;
		await fireEvent.click(markAll);
		await fireEvent.click(markAll);

		expect(onSaveBatch).toHaveBeenCalledTimes(1);
		expect(confirmation.getAttribute('aria-busy')).toBe('true');
		expect(markAll.disabled).toBe(true);
		expect(editor.getAttribute('aria-busy')).toBe('true');

		settles[0].reject(new Error('Batch denied'));

		await waitFor(() => expect(confirmation.hasAttribute('aria-busy')).toBe(false));
		expect(errorToast).toHaveBeenCalledWith('Batch denied', { duration: 6000 });
		expect(screen.getByRole('alertdialog')).toBe(confirmation);
		expect(editor.hasAttribute('aria-busy')).toBe(false);

		await fireEvent.click(markAll);
		expect(screen.getByRole('alertdialog')).toBe(confirmation);
		settles[1].resolve();

		await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
		expect(onSaveBatch).toHaveBeenCalledTimes(2);
	});

	it('counts saved currency states instead of display labels and excludes exemptions and inapplicable rows', () => {
		const types: TrainingType[] = [
			neverExpiresType,
			{ ...expirationDateOnlyType, id: 'orange' },
			{ ...expirationDateOnlyType, id: 'yellow' },
			{ ...expirationDateOnlyType, id: 'expired' },
			expiringType,
			{ ...expiringType, id: 'exempt', canBeExempted: true, exemptPersonnelIds: [person.id] },
			{ ...expiringType, id: 'optional', isOptional: true }
		];
		const records: PersonnelTraining[] = [
			{ type: neverExpiresType.id, expires: null },
			{ type: 'orange', expires: '2026-04-20' },
			{ type: 'yellow', expires: '2026-05-21' },
			{ type: 'expired', expires: '2026-04-05' }
		].map(({ type, expires }) => ({
			id: `record-${type}`,
			personnelId: person.id,
			trainingTypeId: type,
			completionDate: null,
			expirationDate: expires,
			notes: null,
			certificateUrl: null
		}));
		render(PersonTrainingEditor, {
			props: { person, trainingTypes: types, trainings: records, onSave: vi.fn(), onRemove: vi.fn(), onClose: vi.fn() }
		});
		for (const label of ['Current', '<60d', '<30d', 'Expired', 'Not Done']) {
			expect(within(screen.getByRole('group', { name: label })).getByText('1')).toBeTruthy();
		}
	});

	it('retains the deletion confirmation and saved record after failure and permits retry', async () => {
		vi.useRealTimers();
		const onRemove = vi.fn().mockRejectedValueOnce(new Error('Removal failed')).mockResolvedValueOnce(undefined);
		const errorToast = vi.spyOn(toast, 'error').mockImplementation(() => 'error');
		const record: PersonnelTraining = {
			id: 'record-1',
			personnelId: person.id,
			trainingTypeId: neverExpiresType.id,
			completionDate: null,
			expirationDate: null,
			notes: 'Saved notes',
			certificateUrl: null
		};
		render(PersonTrainingEditor, {
			props: {
				person,
				trainingTypes: [neverExpiresType],
				trainings: [record],
				onSave: vi.fn(),
				onRemove,
				onClose: vi.fn()
			}
		});
		await fireEvent.click(screen.getByRole('button', { name: 'Remove Orientation record' }));
		await fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Delete' }));
		await waitFor(() => expect(errorToast).toHaveBeenCalled());
		expect(screen.getByRole('alertdialog')).toBeTruthy();
		expect(screen.getByText('Saved notes')).toBeTruthy();
		await fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Delete' }));
		await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
		// A resolved callback can mean an approval request; retained props remain authoritative.
		await fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
		expect((screen.getByLabelText('Mark as Complete') as HTMLButtonElement).getAttribute('aria-checked')).toBe('true');
		expect((screen.getByLabelText('Notes') as HTMLInputElement).value).toBe('Saved notes');
		expect(onRemove.mock.calls.map(([id]) => id)).toEqual(['record-1', 'record-1']);
	});

	it('keeps a disposed person editor quiet after a late removal error', async () => {
		vi.useRealTimers();
		let rejectRemove!: (error: Error) => void;
		const pendingRemove = new Promise<void>((_, reject) => {
			rejectRemove = reject;
		});
		const errorToast = vi.spyOn(toast, 'error').mockImplementation(() => 'error');
		const onClose = vi.fn();
		const view = render(PersonTrainingEditor, {
			props: {
				person,
				trainingTypes: [neverExpiresType],
				trainings: [
					{
						id: 'record-1',
						personnelId: person.id,
						trainingTypeId: neverExpiresType.id,
						completionDate: null,
						expirationDate: null,
						notes: 'Organization A original',
						certificateUrl: null
					}
				],
				onSave: vi.fn(),
				onRemove: () => pendingRemove,
				onClose
			}
		});
		await fireEvent.click(screen.getByRole('button', { name: 'Remove Orientation record' }));
		await fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Delete' }));
		await view.unmount();
		rejectRemove(new Error('Retired person removal'));
		await tick();

		expect({ error: errorToast.mock.calls.length, close: onClose.mock.calls.length }).toEqual({ error: 0, close: 0 });
	});

	it('calls onSaveBatch once when marking all applicable trainings completed today', async () => {
		const onSave = vi.fn().mockResolvedValue(undefined);
		const onSaveBatch = vi.fn().mockResolvedValue(undefined);
		renderEditor({ onSave, onSaveBatch });

		await confirmMarkAllCompleted();

		await waitFor(() => expect(onSaveBatch).toHaveBeenCalledTimes(1));
		expect(onSave).not.toHaveBeenCalled();
		expect(onSaveBatch).toHaveBeenCalledWith([
			{
				personnelId: person.id,
				trainingTypeId: expiringType.id,
				completionDate: '2026-04-06',
				notes: undefined,
				status: 'completed'
			},
			{
				personnelId: person.id,
				trainingTypeId: neverExpiresType.id,
				completionDate: '2026-04-06',
				notes: undefined,
				status: 'completed'
			}
		]);
	});

	it('falls back to one onSave call per applicable type when onSaveBatch is omitted', async () => {
		const onSave = vi.fn().mockResolvedValue(undefined);
		renderEditor({ onSave });

		await confirmMarkAllCompleted();

		await waitFor(() => expect(onSave).toHaveBeenCalledTimes(2));
		expect(onSave).toHaveBeenNthCalledWith(1, {
			personnelId: person.id,
			trainingTypeId: expiringType.id,
			completionDate: '2026-04-06',
			expirationDate: '2027-04-06',
			notes: null,
			certificateUrl: null
		});
		expect(onSave).toHaveBeenNthCalledWith(2, {
			personnelId: person.id,
			trainingTypeId: neverExpiresType.id,
			completionDate: '2026-04-06',
			expirationDate: null,
			notes: null,
			certificateUrl: null
		});
	});
});
