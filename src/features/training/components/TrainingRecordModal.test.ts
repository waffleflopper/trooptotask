// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import TrainingRecordModal from './TrainingRecordModal.svelte';
import type { Personnel } from '$lib/types';
import type { TrainingType } from '$features/training/training.types';

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
});
