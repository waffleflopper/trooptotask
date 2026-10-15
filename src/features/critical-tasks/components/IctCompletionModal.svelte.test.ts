// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { tick } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import IctCompletionModal from './IctCompletionModal.svelte';
import { toastStore } from '$lib/stores/toast.svelte';
import type { IctTask, PersonnelIctCompletion } from '$features/critical-tasks/criticalTasks.types';
import type { Personnel } from '$features/personnel/contracts';

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
		completions: PersonnelIctCompletion[];
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

function descriptions(control: HTMLElement): string[] {
	return (control.getAttribute('aria-describedby') ?? '')
		.split(' ')
		.filter(Boolean)
		.map((id) => document.getElementById(id)?.textContent?.trim() ?? '');
}

async function chooseDate(label: RegExp): Promise<void> {
	await fireEvent.click(screen.getByLabelText(/Completion Date/i));
	const day = await screen.findByRole('button', { name: label });
	await fireEvent.click(day);
}

beforeEach(() => {
	vi.useFakeTimers({ toFake: ['Date'] });
	vi.setSystemTime(new Date('2026-05-01T12:00:00.000Z'));
});

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
	vi.useRealTimers();
});

describe('IctCompletionModal', () => {
	it('edits the latest capture for the selected pair, breaking same-date ties by log time', async () => {
		const onSave = vi.fn().mockResolvedValue(undefined);
		const capture: PersonnelIctCompletion = {
			id: 'same-date-earlier-log',
			personnelId: person.id,
			ictTaskId: task.id,
			completedAt: '2026-04-02',
			validationMethod: 'Demonstration',
			validatedBy: null,
			notes: 'Selected capture',
			loggedBy: null,
			createdAt: '2026-04-02T10:00:00Z'
		};
		renderModal({
			onSave,
			completions: [
				{ ...capture, id: 'backdated-later-log', completedAt: '2026-04-01', createdAt: '2099-01-01T12:00:00Z' },
				{ ...capture, id: 'same-date-latest-log', createdAt: '2026-04-02T11:00:00Z' },
				capture,
				{ ...capture, id: 'another-person', personnelId: 'person-2', completedAt: '2026-05-01' }
			]
		});

		await fireEvent.click(screen.getByTestId('ict-completion-save'));
		await waitFor(() => {
			expect(onSave).toHaveBeenCalledWith(
				expect.objectContaining({
					completedAt: '2026-04-02',
					validationMethod: 'Demonstration',
					notes: 'Selected capture'
				}),
				'same-date-latest-log'
			);
		});
	});

	it('validates required fields before saving', async () => {
		const onSave = vi.fn();

		renderModal({ onSave });

		await fireEvent.click(screen.getByTestId('ict-completion-save'));

		expect(onSave).not.toHaveBeenCalled();
		expect(screen.getByText('Completion date is required')).toBeTruthy();
		expect(screen.getByText('Validation method is required')).toBeTruthy();
	});

	it('associates required errors and help text with their controls until values are selected', async () => {
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
		const personControl = screen.getByRole('button', { name: 'Person' });
		const taskControl = screen.getByRole('button', { name: 'Critical Task' });
		expect(descriptions(personControl)).toEqual(['Person is required']);
		expect(personControl.getAttribute('aria-invalid')).toBe('true');
		expect(descriptions(taskControl)).toEqual(['Select a person to narrow tasks by MOS.', 'Critical task is required']);
		expect(taskControl.getAttribute('aria-invalid')).toBe('true');
		expect(descriptions(screen.getByLabelText('Completion Date'))).toEqual(['Completion date is required']);
		expect(screen.getByLabelText('Validation Method').getAttribute('aria-invalid')).toBe('true');
		expect(descriptions(screen.getByLabelText('Validated By'))).toEqual(['Optional rank and name of the validator']);
		expect(screen.getByLabelText('Validated By').getAttribute('aria-invalid')).toBeNull();

		await fireEvent.click(screen.getByRole('button', { name: 'Person' }));
		await fireEvent.click(await screen.findByRole('option', { name: /SGT Smith, Jane/ }));
		await fireEvent.click(screen.getByRole('button', { name: 'Critical Task' }));
		await fireEvent.click(await screen.findByRole('option', { name: /181-105-1001 TCCC/ }));
		await fireEvent.click(screen.getByTestId('ict-completion-save'));

		expect(screen.queryByText('Person is required')).toBeNull();
		expect(screen.queryByText('Critical task is required')).toBeNull();
		expect(personControl.getAttribute('aria-invalid')).toBeNull();
		expect(descriptions(taskControl)).toEqual(['Showing tasks applicable to this person.']);
		expect(screen.getByText('Completion date is required')).toBeTruthy();
		expect(screen.getByText('Validation method is required')).toBeTruthy();
	});

	it('autofills the validator and submits the completion payload', async () => {
		const onSave = vi.fn().mockResolvedValue(undefined);
		const onClose = vi.fn();
		const successSpy = vi.spyOn(toastStore, 'success').mockImplementation(() => 'toast-id');

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

	it('locks the draft while a save is held and keeps it unlocked after a failure', async () => {
		let rejectSave!: (error: Error) => void;
		const onSave = vi.fn(
			() =>
				new Promise<void>((_, reject) => {
					rejectSave = reject;
				})
		);
		vi.spyOn(toastStore, 'error').mockImplementation(() => 'toast-id');
		// happy-dom does not apply a disabled fieldset to its controls' :disabled state.
		const inDisabledGroup = (control: HTMLElement) => control.closest('fieldset')?.disabled === true;
		renderModal({
			existingCompletion: {
				id: 'completion-1',
				personnelId: 'person-1',
				ictTaskId: 'task-1',
				completedAt: '2097-03-10',
				validationMethod: 'Lecture',
				validatedBy: null,
				notes: null,
				loggedBy: null,
				createdAt: '2026-04-02T00:00:00.000Z'
			},
			onSave
		});
		const dialog = screen.getByRole('dialog', { name: 'Edit ICT Completion' });
		await fireEvent.input(screen.getByLabelText(/Notes \(optional\)/i), { target: { value: 'Draft A' } });
		const save = screen.getByTestId('ict-completion-save');

		await fireEvent.click(save);
		await fireEvent.click(save);

		expect(onSave).toHaveBeenCalledTimes(1);
		expect(dialog.getAttribute('aria-busy')).toBe('true');
		for (const label of [/Notes \(optional\)/i, /Validated By/i, /Validation Method/i]) {
			expect(inDisabledGroup(screen.getByLabelText(label))).toBe(true);
		}

		rejectSave(new Error('Save denied'));

		await waitFor(() => expect(dialog.hasAttribute('aria-busy')).toBe(false));
		const notes = screen.getByLabelText(/Notes \(optional\)/i) as HTMLTextAreaElement;
		expect(notes.value).toBe('Draft A');
		expect(inDisabledGroup(notes)).toBe(false);
	});

	it('shows a failed save inside the dialog, keeps the draft, returns focus to Save and holds Escape', async () => {
		const onClose = vi.fn();
		const onSave = vi.fn().mockRejectedValue(new Error('Failed to save ICT completion'));
		renderModal({ onSave, onClose });
		const dialog = screen.getByRole('dialog', { name: 'Log ICT Completion' });

		await chooseDate(/May 10, 2026/i);
		await fireEvent.change(screen.getByLabelText(/Validation Method/i), { target: { value: 'Demonstration' } });
		await fireEvent.input(screen.getByLabelText(/Notes \(optional\)/i), { target: { value: 'Range day' } });
		await fireEvent.click(screen.getByTestId('ict-completion-save'));

		const alert = await screen.findByRole('alert');
		expect(dialog.contains(alert)).toBe(true);
		expect(alert.textContent).toContain('Failed to save ICT completion');
		await waitFor(() => expect(document.activeElement).toBe(screen.getByTestId('ict-completion-save')));
		expect((screen.getByLabelText(/Notes \(optional\)/i) as HTMLTextAreaElement).value).toBe('Range day');
		expect((screen.getByLabelText(/Validation Method/i) as HTMLSelectElement).value).toBe('Demonstration');

		await fireEvent.keyDown(document.activeElement ?? dialog, { key: 'Escape' });
		expect(onClose).not.toHaveBeenCalled();
		expect(screen.getByRole('dialog', { name: 'Log ICT Completion' })).toBeTruthy();
	});

	it('closes a pristine dialog on Escape', async () => {
		const onClose = vi.fn();
		renderModal({ onClose });

		await fireEvent.keyDown(screen.getByRole('dialog', { name: 'Log ICT Completion' }), { key: 'Escape' });

		expect(onClose).toHaveBeenCalledTimes(1);
	});

	describe('while the store changes under a held save', () => {
		const optimistic: PersonnelIctCompletion = {
			id: 'temp-1',
			personnelId: 'person-1',
			ictTaskId: 'task-1',
			completedAt: '2026-05-10',
			validationMethod: 'Practical Exercise',
			validatedBy: null,
			notes: 'Lane validation',
			loggedBy: null,
			createdAt: '2026-05-01T12:00:00.000Z'
		};

		function renderWithLiveStore(onSave: () => Promise<void>) {
			const props = $state({
				person,
				task,
				settings: { defaultExpirationMonths: 12, expiringSoonWarningDays: 60 },
				currentUserDisplayName: 'SFC Taylor Example',
				completions: [] as PersonnelIctCompletion[],
				onSave,
				onClose: vi.fn()
			});
			render(IctCompletionModal, { props });
			return props;
		}

		async function fillDraft() {
			await chooseDate(/May 10, 2026/i);
			await fireEvent.change(screen.getByLabelText(/Validation Method/i), { target: { value: 'Practical Exercise' } });
			await fireEvent.input(screen.getByLabelText(/Notes \(optional\)/i), { target: { value: 'Lane validation' } });
		}

		it('keeps the Log title and the entered draft while a new completion is held, then rolled back', async () => {
			let rejectSave!: (error: Error) => void;
			const props = renderWithLiveStore(
				() =>
					new Promise<void>((_, reject) => {
						rejectSave = reject;
					})
			);
			await fillDraft();

			await fireEvent.click(screen.getByTestId('ict-completion-save'));
			props.completions = [optimistic];
			await tick();

			expect(screen.getByRole('dialog', { name: 'Log ICT Completion' })).toBeTruthy();
			expect(screen.queryByRole('dialog', { name: 'Edit ICT Completion' })).toBeNull();

			rejectSave(new Error('Save denied'));
			expect((await screen.findByRole('alert')).textContent).toContain('Save denied');
			props.completions = [];
			await tick();

			expect(screen.getByRole('dialog', { name: 'Log ICT Completion' })).toBeTruthy();
			expect((screen.getByLabelText(/Validation Method/i) as HTMLSelectElement).value).toBe('Practical Exercise');
			expect((screen.getByLabelText(/Notes \(optional\)/i) as HTMLTextAreaElement).value).toBe('Lane validation');
			expect(screen.getByText('May 10, 2026')).toBeTruthy();
		});

		it('reports a new completion as saved even after the store already holds it', async () => {
			let resolveSave!: () => void;
			const successSpy = vi.spyOn(toastStore, 'success').mockImplementation(() => 'toast-id');
			const props = renderWithLiveStore(
				() =>
					new Promise<void>((resolve) => {
						resolveSave = resolve;
					})
			);
			await fillDraft();

			await fireEvent.click(screen.getByTestId('ict-completion-save'));
			props.completions = [optimistic];
			await tick();
			resolveSave();

			await waitFor(() => expect(successSpy).toHaveBeenCalledWith('ICT completion saved'));
			expect(props.onClose).toHaveBeenCalledTimes(1);
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
