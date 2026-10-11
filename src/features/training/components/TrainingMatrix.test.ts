// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import TrainingMatrix from './TrainingMatrix.svelte';
import type { Personnel } from '$features/personnel/contracts';
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

	it('exposes the sort state on the column header and keeps focus on the sort button', async () => {
		const adams: Personnel = { ...person, id: 'person-2', lastName: 'Adams', firstName: 'Zed' };
		render(TrainingMatrix, {
			props: { personnel: [person, adams], trainingTypes: [trainingType], trainings: [persistedTraining] }
		});
		const nameHeader = screen.getByRole('columnheader', { name: /^Name/ });
		const typeHeader = screen.getByRole('columnheader', { name: /CPR/ });
		const rowOrder = () => screen.getAllByRole('rowheader').map((header) => header.textContent?.trim());

		expect(nameHeader.getAttribute('aria-sort')).toBe('ascending');
		expect(typeHeader.getAttribute('aria-sort')).toBe('none');
		expect(rowOrder()).toEqual(['SGT Adams, Zed', 'SGT Smith, Jane']);

		const nameButton = screen.getByRole('button', { name: /^Name/ });
		await fireEvent.click(nameButton);
		expect(nameHeader.getAttribute('aria-sort')).toBe('descending');
		expect(rowOrder()).toEqual(['SGT Smith, Jane', 'SGT Adams, Zed']);

		const typeButton = screen.getByRole('button', { name: /CPR/ });
		typeButton.focus();
		await fireEvent.click(typeButton);
		expect(typeHeader.getAttribute('aria-sort')).toBe('ascending');
		expect(nameHeader.getAttribute('aria-sort')).toBe('none');
		expect(document.activeElement).toBe(typeButton);
	});

	it('opens the person from the row header button', async () => {
		const onPersonClick = vi.fn();
		render(TrainingMatrix, {
			props: { personnel: [person], trainingTypes: [trainingType], trainings: [], onPersonClick }
		});

		await fireEvent.click(screen.getByRole('button', { name: /Smith, Jane/ }));

		expect(onPersonClick).toHaveBeenCalledWith(person);
	});
});
