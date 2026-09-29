// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import PersonTrainingEditor from './PersonTrainingEditor.svelte';
import type { Personnel } from '$lib/types';
import type { PersonnelTraining, TrainingType } from '$features/training/training.types';
import { toastStore } from '$lib/stores/toast.svelte';

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
	it('retains the deletion confirmation and saved record after failure and permits retry', async () => {
		vi.useRealTimers();
		const onRemove = vi.fn().mockRejectedValueOnce(new Error('Removal failed')).mockResolvedValueOnce(undefined);
		const errorToast = vi.spyOn(toastStore, 'error').mockImplementation(() => 'error');
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
		expect(onRemove.mock.calls).toEqual([['record-1'], ['record-1']]);
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
