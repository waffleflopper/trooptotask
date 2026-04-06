// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import TrainingMatrix from './TrainingMatrix.svelte';
import type { Personnel } from '$lib/types';
import type { PersonnelTraining, TrainingType } from '$features/training/training.types';

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

const persistedTraining: PersonnelTraining = {
	id: 'training-1',
	personnelId: person.id,
	trainingTypeId: trainingType.id,
	completionDate: '2098-01-01',
	expirationDate: '2099-01-01',
	notes: null,
	certificateUrl: null
};

afterEach(() => {
	cleanup();
});

describe('TrainingMatrix', () => {
	it('updates a cell when persisted trainings hydrate after initial render', async () => {
		const view = render(TrainingMatrix, {
			props: {
				personnel: [person],
				trainingTypes: [trainingType],
				trainings: []
			}
		});

		expect(screen.getByLabelText('Smith CPR: Not Done')).toBeTruthy();

		await view.rerender({
			personnel: [person],
			trainingTypes: [trainingType],
			trainings: [persistedTraining]
		});

		await waitFor(() => {
			expect(screen.getByLabelText('Smith CPR: Current')).toBeTruthy();
		});
	});
});
