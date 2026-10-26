// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { toast } from 'svelte-sonner';
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

vi.mock('svelte-sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const AS_OF = '2026-10-25';
const ORG_ID = 'org-1';

const matrixProps = {
	title: 'All trainings',
	orgId: ORG_ID,
	asOf: AS_OF,
	goalPercent: 90
};

function record(overrides: Partial<PersonnelTraining> = {}): PersonnelTraining {
	return { ...persistedTraining, completionDate: '2026-06-15', expirationDate: '2027-06-15', ...overrides };
}

afterEach(() => {
	cleanup();
	vi.mocked(toast.success).mockClear();
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

async function openPopover(): Promise<HTMLElement> {
	const heading = await screen.findByText(/^Record · /);
	return heading.closest('form') as HTMLElement;
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
				...matrixProps,
				personnel: [person],
				trainingTypes: [trainingType],
				trainings: []
			}
		});

		expect(screen.getByLabelText('Smith CPR: No record')).toBeTruthy();

		await view.rerender({
			...matrixProps,
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
			props: {
				...matrixProps,
				personnel: [person, adams],
				trainingTypes: [trainingType],
				trainings: [persistedTraining]
			}
		});
		const nameHeader = screen.getByRole('columnheader', { name: /^Name/ });
		const typeHeader = screen.getByRole('columnheader', { name: /CPR/ });
		const rowOrder = () => mountedNames().map((name) => `SGT ${name}`);

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
			props: { ...matrixProps, personnel: [person], trainingTypes: [trainingType], trainings: [], onPersonClick }
		});

		await fireEvent.click(screen.getByRole('button', { name: /Smith, Jane/ }));

		expect(onPersonClick).toHaveBeenCalledWith(person);
	});

	it('mounts only the rows around the scroll position of a large roster', async () => {
		render(TrainingMatrix, {
			props: { ...matrixProps, personnel: roster(400), trainingTypes: [trainingType], trainings: [persistedTraining] }
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
		const onRecord = vi.fn();
		const people = roster(400);
		render(TrainingMatrix, {
			props: { ...matrixProps, personnel: people, trainingTypes: [trainingType], trainings: [], onRecord }
		});
		// The browser scrolls a focused cell into view; happy-dom does not.
		const followFocus = async () => {
			const row = document.activeElement?.closest('tr');
			const index = Number(row?.getAttribute('aria-rowindex')) - 1;
			await scrollTo(Math.max(0, index * ROW_HEIGHT + HEADER_HEIGHT - VIEWPORT_HEIGHT));
		};

		await user.tab();
		await user.tab();
		await user.tab();
		expect(document.activeElement?.getAttribute('aria-label')).toBe('P000 CPR: No record');
		for (let index = 1; index <= 40; index++) {
			await user.tab();
			await followFocus();
		}
		await user.keyboard('{Enter}');

		expect(mountedNames()).not.toContain('P000, Test');
		const popover = await openPopover();
		expect(within(popover).getByText(/Record · CPR/)).toBeTruthy();
		expect(within(popover).getByText(/P040, Test/)).toBeTruthy();
	});

	it('keeps the focused cell mounted and focused while scrolled far away and back', async () => {
		const user = userEvent.setup();
		render(TrainingMatrix, {
			props: { ...matrixProps, personnel: roster(400), trainingTypes: [trainingType], trainings: [], onRecord: vi.fn() }
		});
		await user.tab();
		await user.tab();
		await user.tab();
		const focused = document.activeElement;
		expect(focused?.getAttribute('aria-label')).toBe('P000 CPR: No record');

		await scrollTo(300 * ROW_HEIGHT);

		expect(document.activeElement).toBe(focused);
		expect(focused?.closest('tr')?.getAttribute('aria-rowindex')).toBe('2');
		expect(mountedNames()).toEqual(expect.arrayContaining(['P000, Test', 'P300, Test']));
		expect(mountedNames()).not.toContain('P100, Test');

		await scrollTo(0);

		expect(document.activeElement).toBe(focused);
		expect(screen.getAllByRole('button', { name: 'P000 CPR: No record' })).toEqual([focused]);
	});

	it('windows grouped rows and skips a collapsed group', async () => {
		render(TrainingMatrix, {
			props: {
				...matrixProps,
				personnel: roster(400, 25),
				trainingTypes: [trainingType],
				trainings: [],
				groupBy: { key: (p) => p.groupName ?? '' }
			}
		});

		expect(screen.getByRole('table').getAttribute('aria-rowcount')).toBe('417');
		expect(mountedNames()[0]).toBe('P000, Test');

		await fireEvent.click(screen.getByRole('button', { name: /G00/ }));

		expect(screen.getByRole('table').getAttribute('aria-rowcount')).toBe('392');
		expect(mountedNames()[0]).toBe('P025, Test');
		expect(mountedNames()).not.toContain('P000, Test');
	});
});

function named(lastName: string, id = `person-${lastName}`): Personnel {
	return { ...person, id, lastName };
}

function rowFor(lastName: string): HTMLElement {
	return screen.getByRole('rowheader', { name: new RegExp(lastName) }).closest('tr') as HTMLElement;
}

function cellStatus(lastName: string): { status: string | null | undefined; text: string } {
	const cell = rowFor(lastName).querySelector('[data-slot="training-matrix-cell"]');
	return { status: cell?.getAttribute('data-status'), text: cell?.textContent?.trim() ?? '' };
}

describe('TrainingMatrix cell text', () => {
	it('shows each status as its own word, date or day count', () => {
		const people = ['Adams', 'Baker', 'Clark', 'Davis', 'Evans'].map((lastName) => named(lastName));
		const trainings = [
			record({ id: 't-a', personnelId: 'person-Adams', expirationDate: '2027-06-15' }),
			record({ id: 't-b', personnelId: 'person-Baker', expirationDate: '2026-12-08' }),
			record({ id: 't-c', personnelId: 'person-Clark', expirationDate: '2026-11-06' }),
			record({ id: 't-d', personnelId: 'person-Davis', expirationDate: '2026-08-04' })
		];
		const lead: TrainingType = { ...trainingType, id: 'type-2', name: 'Lead', appliesToMos: ['91B'], sortOrder: 1 };
		render(TrainingMatrix, {
			props: { ...matrixProps, personnel: people, trainingTypes: [trainingType, lead], trainings }
		});

		expect(cellStatus('Adams').text).toContain('Jun ’27');
		expect(cellStatus('Baker')).toMatchObject({ status: 'warning-yellow' });
		expect(cellStatus('Baker').text).toContain('44d');
		expect(cellStatus('Clark')).toMatchObject({ status: 'warning-orange' });
		expect(cellStatus('Clark').text).toContain('12d');
		expect(cellStatus('Davis')).toMatchObject({ status: 'expired' });
		expect(cellStatus('Davis').text).toContain('Expired');
		expect(cellStatus('Evans')).toMatchObject({ status: 'not-completed' });
		expect(cellStatus('Evans').text).toContain('No record');
		const quiet = rowFor('Adams').querySelectorAll('[data-slot="training-matrix-cell"]')[1];
		expect(quiet?.getAttribute('data-status')).toBe('not-required');
		expect(quiet?.textContent).toContain('—');
	});

	it('shows an exempt person as Exempt', () => {
		const exemptType: TrainingType = { ...trainingType, canBeExempted: true, exemptPersonnelIds: [person.id] };
		render(TrainingMatrix, {
			props: { ...matrixProps, personnel: [person], trainingTypes: [exemptType], trainings: [] }
		});

		expect(cellStatus('Smith')).toMatchObject({ status: 'exempt' });
		expect(cellStatus('Smith').text).toContain('Exempt');
	});

	it('labels each column with its renewal interval', () => {
		const dated: TrainingType = {
			...trainingType,
			id: 'type-2',
			name: 'Card',
			expirationMonths: null,
			expirationDateOnly: true
		};
		const forever: TrainingType = { ...trainingType, id: 'type-3', name: 'Once', expirationMonths: null };
		render(TrainingMatrix, {
			props: { ...matrixProps, personnel: [person], trainingTypes: [trainingType, dated, forever], trainings: [] }
		});

		expect(screen.getByRole('columnheader', { name: /CPR/ }).textContent).toContain('12 mo');
		expect(screen.getByRole('columnheader', { name: /Card/ }).textContent).toContain('Date');
		expect(screen.getByRole('columnheader', { name: /Once/ }).textContent).toContain('No expiry');
	});
});

describe('TrainingMatrix footer and group bands', () => {
	it('counts people who are not ready in the footer, with those lapsing within 30 days beneath', async () => {
		const people = ['Adams', 'Baker', 'Clark'].map((lastName) => named(lastName));
		const trainings = [
			record({ id: 't-a', personnelId: 'person-Adams', expirationDate: '2026-08-04' }),
			record({ id: 't-b', personnelId: 'person-Baker', expirationDate: '2026-11-06' })
		];
		const view = render(TrainingMatrix, {
			props: { ...matrixProps, personnel: people, trainingTypes: [trainingType], trainings }
		});
		const footer = () => document.querySelector('[data-matrix-footer] td')?.textContent?.replace(/\s+/g, ' ').trim();

		expect(footer()).toBe('2 not ready +1 in 30d');

		await view.rerender({ ...matrixProps, personnel: [people[1]], trainingTypes: [trainingType], trainings });

		expect(footer()).toBe('0 not ready +1 in 30d');
	});

	it('shows the gap counts of a collapsed group in its band', async () => {
		const people = [
			{ ...named('Adams'), groupName: 'Alpha' },
			{ ...named('Baker'), groupName: 'Alpha' },
			{ ...named('Clark'), groupName: 'Bravo' }
		];
		render(TrainingMatrix, {
			props: {
				...matrixProps,
				personnel: people,
				trainingTypes: [trainingType],
				trainings: [],
				groupBy: { key: (p) => p.groupName ?? '' }
			}
		});
		const bandCell = (label: string) =>
			screen
				.getByRole('button', { name: new RegExp(label) })
				.closest('tr')
				?.querySelector('td')
				?.textContent?.replace(/\s+/g, ' ')
				.trim();

		expect(bandCell('Alpha')).toBe('');

		await fireEvent.click(screen.getByRole('button', { name: /Alpha/ }));

		expect(bandCell('Alpha')).toBe('2 not ready');
		expect(bandCell('Bravo')).toBe('');
	});
});

describe('TrainingMatrix recording popover', () => {
	const cardType: TrainingType = {
		...trainingType,
		id: 'type-card',
		name: 'Card',
		expirationMonths: null,
		expirationDateOnly: true
	};
	const foreverType: TrainingType = { ...trainingType, id: 'type-once', name: 'Once', expirationMonths: null };

	function mountRecordable(overrides: Record<string, unknown> = {}) {
		const onRecord = vi.fn().mockResolvedValue(undefined);
		const props = {
			...matrixProps,
			personnel: [person],
			trainingTypes: [trainingType, cardType, foreverType],
			trainings: [] as PersonnelTraining[],
			onRecord,
			...overrides
		};
		const view = render(TrainingMatrix, { props });
		return { view, props, onRecord };
	}

	const dateInput = (popover: HTMLElement) =>
		within(popover).getByLabelText(/Completed|Expires on/) as HTMLInputElement;

	it('defaults the completion date to the Organization day and previews the new lapse for a months type', async () => {
		mountRecordable();

		await fireEvent.click(screen.getByRole('button', { name: 'Smith CPR: No record' }));
		const popover = await openPopover();

		expect(within(popover).getByText('Record · CPR')).toBeTruthy();
		expect(within(popover).getByText('12 mo')).toBeTruthy();
		expect(within(popover).getByText('No record')).toBeTruthy();
		expect(dateInput(popover).value).toBe('2026-10-25');
		expect(within(popover).getByText('Today')).toBeTruthy();
		expect(within(popover).getByText('Current until 25 Oct 2027')).toBeTruthy();
	});

	it('defaults the completion date to the Organization day for a type that never expires', async () => {
		mountRecordable();

		await fireEvent.click(screen.getByRole('button', { name: 'Smith Once: No record' }));
		const popover = await openPopover();

		expect(dateInput(popover).value).toBe('2026-10-25');
		expect(within(popover).getByText('No expiry')).toBeTruthy();
		expect(within(popover).getByText('Never expires')).toBeTruthy();
	});

	it('asks for the card date with no default for a card-date type', async () => {
		mountRecordable();

		await fireEvent.click(screen.getByRole('button', { name: 'Smith Card: No record' }));
		const popover = await openPopover();

		expect(within(popover).getByLabelText('Expires on')).toBeTruthy();
		expect(dateInput(popover).value).toBe('');
		expect(within(popover).queryByText('Today')).toBeNull();
		expect((within(popover).getByRole('button', { name: /^Save/ }) as HTMLButtonElement).disabled).toBe(true);
	});

	it('states how long ago an expired record lapsed', async () => {
		mountRecordable({ trainings: [record({ expirationDate: '2026-08-04' })] });

		await fireEvent.click(screen.getByRole('button', { name: 'Smith CPR: Expired 82d ago' }));
		const popover = await openPopover();

		expect(within(popover).getByText('Expired 4 Aug 2026 · 82 days ago')).toBeTruthy();
	});

	it('saves with Enter and puts focus back on the cell', async () => {
		const user = userEvent.setup();
		const { onRecord } = mountRecordable();
		const cell = screen.getByRole('button', { name: 'Smith CPR: No record' });

		await user.click(cell);
		const popover = await openPopover();
		dateInput(popover).focus();
		await user.keyboard('{Enter}');

		await waitFor(() => expect(onRecord).toHaveBeenCalledTimes(1));
		expect(onRecord).toHaveBeenCalledWith({
			personnelId: 'person-1',
			trainingTypeId: 'type-1',
			completionDate: '2026-10-25',
			expirationDate: '2027-10-25',
			notes: null,
			certificateUrl: null
		});
		await waitFor(() => expect(screen.queryByText('Record · CPR')).toBeNull());
		expect(document.activeElement).toBe(cell);
	});

	it('records a card date as the expiration with no completion date', async () => {
		const user = userEvent.setup();
		const { onRecord } = mountRecordable();

		await user.click(screen.getByRole('button', { name: 'Smith Card: No record' }));
		const popover = await openPopover();
		await fireEvent.input(dateInput(popover), { target: { value: '2028-01-09' } });
		await user.click(within(popover).getByRole('button', { name: /^Add a note/ }));
		await user.type(within(popover).getByLabelText('Notes'), ' Front desk copy ');
		await user.click(within(popover).getByRole('button', { name: /^Save/ }));

		await waitFor(() => expect(onRecord).toHaveBeenCalledTimes(1));
		expect(onRecord).toHaveBeenCalledWith({
			personnelId: 'person-1',
			trainingTypeId: 'type-card',
			completionDate: null,
			expirationDate: '2028-01-09',
			notes: 'Front desk copy',
			certificateUrl: null
		});
	});

	it('closes on Escape without saving and returns focus to the cell', async () => {
		const user = userEvent.setup();
		const { onRecord } = mountRecordable();
		const cell = screen.getByRole('button', { name: 'Smith CPR: No record' });

		await user.click(cell);
		await openPopover();
		await user.keyboard('{Escape}');

		await waitFor(() => expect(screen.queryByText('Record · CPR')).toBeNull());
		expect(onRecord).not.toHaveBeenCalled();
		expect(document.activeElement).toBe(cell);
	});

	it('keeps the form open with the typed values when the save fails', async () => {
		const user = userEvent.setup();
		const { onRecord } = mountRecordable();
		onRecord.mockRejectedValueOnce(new Error('Connection lost'));

		await user.click(screen.getByRole('button', { name: 'Smith CPR: No record' }));
		const popover = await openPopover();
		await fireEvent.input(dateInput(popover), { target: { value: '2026-10-20' } });
		await user.click(within(popover).getByRole('button', { name: /^Save/ }));

		expect(await within(popover).findByText('Training record was not saved')).toBeTruthy();
		expect(within(popover).getByText('Connection lost')).toBeTruthy();
		expect(dateInput(popover).value).toBe('2026-10-20');
		await waitFor(() => expect(document.activeElement).toBe(within(popover).getByRole('button', { name: /^Save/ })));
		expect(vi.mocked(toast.success)).not.toHaveBeenCalled();
	});

	it('leaves a later popover alone when an earlier save finishes after it was closed', async () => {
		const user = userEvent.setup();
		const jones = named('Jones', 'person-2');
		let finishFirst: () => void = () => undefined;
		const onRecord = vi
			.fn()
			.mockImplementationOnce(() => new Promise<void>((resolve) => (finishFirst = resolve)))
			.mockResolvedValue(undefined);
		render(TrainingMatrix, {
			props: { ...matrixProps, personnel: [person, jones], trainingTypes: [trainingType], trainings: [], onRecord }
		});

		await user.click(screen.getByRole('button', { name: 'Smith CPR: No record' }));
		const first = await openPopover();
		await user.click(within(first).getByRole('button', { name: /^Save/ }));
		await user.keyboard('{Escape}');
		await waitFor(() => expect(screen.queryByText('Record · CPR')).toBeNull());
		await user.click(screen.getByRole('button', { name: 'Jones CPR: No record' }));
		const second = await openPopover();
		expect(within(second).getByText(/Jones, Jane/)).toBeTruthy();

		finishFirst();
		await new Promise((resolve) => setTimeout(resolve, 20));

		expect(second.isConnected).toBe(true);
		expect(within(second).getByText(/Jones, Jane/)).toBeTruthy();
		expect(vi.mocked(toast.success)).not.toHaveBeenCalled();
	});

	it('writes nothing back when the Organization changes while a save is in flight', async () => {
		const user = userEvent.setup();
		let finish: () => void = () => undefined;
		const onRecord = vi.fn().mockImplementationOnce(() => new Promise<void>((resolve) => (finish = resolve)));
		const { view, props } = mountRecordable({ onRecord });

		await user.click(screen.getByRole('button', { name: 'Smith CPR: No record' }));
		const popover = await openPopover();
		await user.click(within(popover).getByRole('button', { name: /^Save/ }));
		await view.rerender({ ...props, orgId: 'org-2' });

		finish();
		await new Promise((resolve) => setTimeout(resolve, 20));

		expect(vi.mocked(toast.success)).not.toHaveBeenCalled();
		expect(screen.getByText('Record · CPR')).toBeTruthy();
	});

	it('does not open a popover when the viewer cannot record', async () => {
		render(TrainingMatrix, {
			props: { ...matrixProps, personnel: [person], trainingTypes: [trainingType], trainings: [] }
		});

		expect(screen.queryByRole('button', { name: 'Smith CPR: No record' })).toBeNull();
		expect(screen.getByLabelText('Smith CPR: No record')).toBeTruthy();
	});
});
