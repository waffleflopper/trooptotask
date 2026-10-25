// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
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

const ROW_HEIGHT = 41;
const HEADER_HEIGHT = 56;
const VIEWPORT_HEIGHT = 640;

function roster(count: number, groupSize = count): Personnel[] {
	return Array.from({ length: count }, (_, index) => ({
		...person,
		id: `person-${index}`,
		lastName: `P${String(index).padStart(3, '0')}`,
		firstName: 'Test',
		groupName: `G${String(Math.floor(index / groupSize)).padStart(2, '0')}`
	}));
}

function mountedNames(): string[] {
	return screen
		.getAllByRole('rowheader')
		.map((header) => header.textContent?.trim() ?? '')
		.filter((text) => text.startsWith('SGT '))
		.map((text) => text.replace(/^SGT /, ''));
}

function viewport(): HTMLElement {
	return screen.getByRole('region', { name: 'Training matrix viewport' });
}

async function scrollTo(top: number) {
	viewport().scrollTop = top;
	await fireEvent.scroll(viewport());
}

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

	it('mounts only the rows around the scroll position of a large roster', async () => {
		render(TrainingMatrix, {
			props: { personnel: roster(400), trainingTypes: [trainingType], trainings: [persistedTraining] }
		});

		expect(screen.getByRole('table').getAttribute('aria-rowcount')).toBe('401');
		expect(mountedNames()).toContain('P000, Test');
		expect(mountedNames()).not.toContain('P200, Test');

		await scrollTo(200 * ROW_HEIGHT);

		const names = mountedNames();
		expect(names).toContain('P200, Test');
		expect(names).toContain('P214, Test');
		expect(names).not.toContain('P000, Test');
		expect(names).not.toContain('P399, Test');
		const p200 = screen.getByRole('rowheader', { name: /P200, Test/ }).closest('tr');
		expect(p200?.getAttribute('aria-rowindex')).toBe('202');
	});

	it('tabs cell by cell past the first window and opens the focused cell with Enter', async () => {
		const user = userEvent.setup();
		const onCellClick = vi.fn();
		const people = roster(400);
		render(TrainingMatrix, { props: { personnel: people, trainingTypes: [trainingType], trainings: [], onCellClick } });
		// The browser scrolls a focused cell into view; happy-dom does not.
		const followFocus = async () => {
			const row = document.activeElement?.closest('tr');
			const index = Number(row?.getAttribute('aria-rowindex')) - 1;
			await scrollTo(Math.max(0, index * ROW_HEIGHT + HEADER_HEIGHT - VIEWPORT_HEIGHT));
		};

		await user.tab();
		await user.tab();
		await user.tab();
		expect(document.activeElement?.getAttribute('aria-label')).toBe('P000 CPR: Not Done');
		for (let index = 1; index <= 40; index++) {
			await user.tab();
			await followFocus();
		}
		await user.keyboard('{Enter}');

		expect(document.activeElement?.getAttribute('aria-label')).toBe('P040 CPR: Not Done');
		expect(mountedNames()).not.toContain('P000, Test');
		expect(onCellClick).toHaveBeenCalledWith(people[40], trainingType, undefined);
	});

	it('keeps the focused cell mounted and focused while scrolled far away and back', async () => {
		const user = userEvent.setup();
		render(TrainingMatrix, {
			props: { personnel: roster(400), trainingTypes: [trainingType], trainings: [], onCellClick: vi.fn() }
		});
		await user.tab();
		await user.tab();
		await user.tab();
		const focused = document.activeElement;
		expect(focused?.getAttribute('aria-label')).toBe('P000 CPR: Not Done');

		await scrollTo(300 * ROW_HEIGHT);

		expect(document.activeElement).toBe(focused);
		expect(focused?.closest('tr')?.getAttribute('aria-rowindex')).toBe('2');
		expect(mountedNames()).toEqual(expect.arrayContaining(['P000, Test', 'P300, Test']));
		expect(mountedNames()).not.toContain('P100, Test');

		await scrollTo(0);

		expect(document.activeElement).toBe(focused);
		expect(screen.getAllByRole('button', { name: 'P000 CPR: Not Done' })).toEqual([focused]);
	});

	it('windows grouped rows and skips a collapsed group', async () => {
		render(TrainingMatrix, {
			props: {
				personnel: roster(400, 25),
				trainingTypes: [trainingType],
				trainings: [],
				groupBy: { key: (p) => p.groupName ?? '' }
			}
		});

		expect(screen.getByRole('table').getAttribute('aria-rowcount')).toBe('417');
		expect(mountedNames()[0]).toBe('P000, Test');

		await fireEvent.click(screen.getByRole('rowheader', { name: /G00 \(25\)/ }));

		expect(screen.getByRole('table').getAttribute('aria-rowcount')).toBe('392');
		expect(mountedNames()[0]).toBe('P025, Test');
		expect(mountedNames()).not.toContain('P000, Test');
	});
});
