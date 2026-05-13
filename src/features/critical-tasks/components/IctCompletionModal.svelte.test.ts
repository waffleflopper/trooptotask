// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import IctCompletionModal from './IctCompletionModal.svelte';
import { toastStore } from '$lib/stores/toast.svelte';
import type { IctTask, PersonnelIctCompletion } from '$features/critical-tasks/criticalTasks.types';
import type { Personnel } from '$lib/types';

const person: Personnel = {
	id: 'person-1',
	rank: 'SGT',
	lastName: 'Smith',
	firstName: 'Jane',
	mos: '68W',
	clinicRole: 'Medic',
	groupId: 'group-1',
	groupName: 'Alpha'
};

const task: IctTask = {
	id: 'task-1',
	taskCode: '181-105-1001',
	title: 'TCCC',
	description: null,
	mos: ['68W'],
	expirationMonths: 12,
	sortOrder: 1,
	archivedAt: null,
	createdAt: '2026-04-01T00:00:00.000Z'
};

function renderModal(
	props: Partial<{
		person: Personnel | null;
		task: IctTask | null;
		personnelOptions: Personnel[];
		taskOptions: IctTask[];
		existingCompletion: PersonnelIctCompletion;
		currentUserDisplayName: string | null;
		onSave: (
			data: Omit<PersonnelIctCompletion, 'id' | 'loggedBy' | 'createdAt'>,
			existingId?: string
		) => void | Promise<void>;
		onClose: () => void;
	}> = {}
) {
	return render(IctCompletionModal, {
		props: {
			person,
			task,
			settings: {
				defaultExpirationMonths: 12,
				expiringSoonWarningDays: 60
			},
			currentUserDisplayName: 'SFC Taylor Example',
			onSave: vi.fn().mockResolvedValue(undefined),
			onClose: vi.fn(),
			...props
		}
	});
}

async function chooseDate(label: RegExp): Promise<void> {
	await fireEvent.click(screen.getByLabelText(/Completion Date/i));
	const day = await screen.findByRole('button', { name: label });
	await fireEvent.click(day);
}

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
});

describe('IctCompletionModal', () => {
	it('validates required fields before saving', async () => {
		const onSave = vi.fn();

		renderModal({ onSave });

		await fireEvent.click(screen.getByTestId('ict-completion-save'));

		expect(onSave).not.toHaveBeenCalled();
		expect(screen.getByText('Completion date is required')).toBeTruthy();
		expect(screen.getByText('Validation method is required')).toBeTruthy();
	});

	it('keeps required selector errors visible until person and task combobox values are selected', async () => {
		const onSave = vi.fn();

		renderModal({
			person: null,
			task: null,
			personnelOptions: [person],
			taskOptions: [task],
			onSave
		});

		await fireEvent.click(screen.getByTestId('ict-completion-save'));

		expect(onSave).not.toHaveBeenCalled();
		expect(screen.getByText('Person is required')).toBeTruthy();
		expect(screen.getByText('Critical task is required')).toBeTruthy();

		await fireEvent.click(screen.getByRole('button', { name: 'Person' }));
		await fireEvent.click(await screen.findByRole('option', { name: /SGT Smith, Jane/ }));
		await fireEvent.click(screen.getByRole('button', { name: 'Critical Task' }));
		await fireEvent.click(await screen.findByRole('option', { name: /181-105-1001 TCCC/ }));
		await fireEvent.click(screen.getByTestId('ict-completion-save'));

		expect(screen.queryByText('Person is required')).toBeNull();
		expect(screen.queryByText('Critical task is required')).toBeNull();
		expect(screen.getByText('Completion date is required')).toBeTruthy();
		expect(screen.getByText('Validation method is required')).toBeTruthy();
	});

	it('autofills the validator and submits the completion payload', async () => {
		const onSave = vi.fn().mockResolvedValue(undefined);
		const onClose = vi.fn();
		const successSpy = vi.spyOn(toastStore, 'success').mockImplementation(() => {});

		renderModal({ onSave, onClose });

		await chooseDate(/May 10, 2026/i);
		await fireEvent.change(screen.getByLabelText(/Validation Method/i), {
			target: { value: 'Practical Exercise' }
		});
		await fireEvent.click(screen.getByLabelText('I am the validator'));
		await waitFor(() => {
			expect((screen.getByLabelText(/Validated By/i) as HTMLInputElement).value).toBe('SFC Taylor Example');
		});
		await fireEvent.input(screen.getByLabelText(/Notes \(optional\)/i), {
			target: { value: 'Lane validation' }
		});

		await fireEvent.click(screen.getByTestId('ict-completion-save'));

		await waitFor(() => {
			expect(onSave).toHaveBeenCalledWith(
				{
					personnelId: 'person-1',
					ictTaskId: 'task-1',
					completedAt: '2026-05-10',
					validationMethod: 'Practical Exercise',
					validatedBy: 'SFC Taylor Example',
					notes: 'Lane validation'
				},
				undefined
			);
			expect(successSpy).toHaveBeenCalledWith('ICT completion saved');
			expect(onClose).toHaveBeenCalledTimes(1);
		});
	});

	it('loads edit mode values and updates the existing completion without duplicating it', async () => {
		const onSave = vi.fn().mockResolvedValue(undefined);
		const onClose = vi.fn();
		const existingCompletion: PersonnelIctCompletion = {
			id: 'completion-1',
			personnelId: 'person-1',
			ictTaskId: 'task-1',
			completedAt: '2097-03-10',
			validationMethod: 'Lecture',
			validatedBy: 'MSG Jordan Example',
			notes: 'Initial entry',
			loggedBy: null,
			createdAt: '2026-04-02T00:00:00.000Z'
		};

		renderModal({ existingCompletion, onSave, onClose, currentUserDisplayName: 'SFC Taylor Example' });

		expect(screen.getByRole('dialog', { name: 'Edit ICT Completion' })).toBeTruthy();
		await waitFor(() => {
			expect(screen.getByText('Mar 10, 2097')).toBeTruthy();
		});
		expect((screen.getByLabelText(/Validation Method/i) as HTMLSelectElement).value).toBe('Lecture');
		expect((screen.getByLabelText(/Validated By/i) as HTMLInputElement).value).toBe('MSG Jordan Example');
		expect(screen.getByText('2098-03-10')).toBeTruthy();

		await fireEvent.change(screen.getByLabelText(/Validation Method/i), {
			target: { value: 'Simulation' }
		});
		await fireEvent.input(screen.getByLabelText(/Validated By/i), {
			target: { value: 'SFC Taylor Example' }
		});
		await fireEvent.input(screen.getByLabelText(/Notes \(optional\)/i), {
			target: { value: 'Corrected entry' }
		});

		await fireEvent.click(screen.getByTestId('ict-completion-save'));

		await waitFor(() => {
			expect(onSave).toHaveBeenCalledWith(
				{
					personnelId: 'person-1',
					ictTaskId: 'task-1',
					completedAt: '2097-03-10',
					validationMethod: 'Simulation',
					validatedBy: 'SFC Taylor Example',
					notes: 'Corrected entry'
				},
				'completion-1'
			);
			expect(onClose).toHaveBeenCalledTimes(1);
		});
	});
});
