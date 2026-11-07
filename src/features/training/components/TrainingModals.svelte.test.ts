// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Personnel } from '$features/personnel/contracts';
import type { TrainingType } from '$features/training/training.types';
import { trainingTypesStore } from '$features/training/stores/trainingTypes.svelte';
import { personnelTrainingsStore } from '$features/training/stores/personnelTrainings.svelte';
import type { TrainingPageContext } from '$features/training/contexts/TrainingPageContext.svelte';
import { ModalRegistry } from '$lib/utils/modalRegistry.svelte';
vi.mock('$app/navigation', () => ({ beforeNavigate: vi.fn() }));
const { loadRecordClassDialog } = vi.hoisted(() => ({ loadRecordClassDialog: vi.fn() }));
vi.mock('$features/training', async (importOriginal) => {
	const actual = await importOriginal<typeof import('$features/training')>();
	loadRecordClassDialog.mockImplementation(actual.loadRecordClassDialog);
	return { ...actual, loadRecordClassDialog };
});

import TrainingModals from './TrainingModals.svelte';

const person: Personnel = {
	id: 'p1',
	rank: 'PFC',
	lastName: 'Brooks',
	firstName: 'Jalen',
	mos: '92Y',
	clinicRole: 'Supply',
	groupId: 'g1',
	groupName: 'Alpha'
};

const fitnessType: TrainingType = {
	id: 'fit',
	name: 'Fitness',
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
	color: '#000000',
	sortOrder: 0,
	expirationDateOnly: false,
	canBeExempted: false,
	exemptPersonnelIds: [],
	isOptional: false
};

function fakeContext(initial: { recordPerson: Personnel | null; recordPersonId: string | null }) {
	const ctx = $state({
		...initial,
		orgId: 'org-1',
		orgUrlSegment: 'org-1',
		readinessAsOf: '2026-10-25',
		rosterReady: true,
		trainingConfigureAffordance: { allowed: false },
		recordNeighbours: { previous: null, next: null },
		restoreRecordFocus: vi.fn(),
		dropRecordParam: vi.fn(),
		stepRecord: vi.fn(),
		closeRecord: vi.fn()
	});
	return ctx;
}

afterEach(cleanup);

describe('TrainingModals record sheet host', () => {
	it('hands focus back to the opener once the record closes', async () => {
		trainingTypesStore.load([], 'org-1');
		personnelTrainingsStore.load([], 'org-1');
		const ctx = fakeContext({ recordPerson: person, recordPersonId: 'p1' });
		render(TrainingModals, { props: { ctx: ctx as unknown as TrainingPageContext, modals: new ModalRegistry() } });
		await screen.findByRole('dialog');
		expect(ctx.restoreRecordFocus).not.toHaveBeenCalled();

		ctx.recordPerson = null;
		ctx.recordPersonId = null;

		await waitFor(() => expect(ctx.restoreRecordFocus).toHaveBeenCalledOnce());
		expect(screen.queryByRole('dialog')).toBeNull();
	});

	it('drops a ?person= that names nobody once the roster is in, and opens nothing', async () => {
		trainingTypesStore.load([], 'org-1');
		personnelTrainingsStore.load([], 'org-1');
		const ctx = fakeContext({ recordPerson: null, recordPersonId: 'nobody' });
		render(TrainingModals, { props: { ctx: ctx as unknown as TrainingPageContext, modals: new ModalRegistry() } });

		await waitFor(() => expect(ctx.dropRecordParam).toHaveBeenCalledOnce());
		expect(screen.queryByRole('dialog')).toBeNull();
	});

	it('waits for the roster before judging a ?person= link', async () => {
		trainingTypesStore.load([], 'org-1');
		personnelTrainingsStore.load([], 'org-1');
		const ctx = fakeContext({ recordPerson: null, recordPersonId: 'p1' });
		ctx.rosterReady = false;
		render(TrainingModals, { props: { ctx: ctx as unknown as TrainingPageContext, modals: new ModalRegistry() } });

		expect(ctx.dropRecordParam).not.toHaveBeenCalled();

		ctx.recordPerson = person;
		ctx.rosterReady = true;

		expect(await screen.findByRole('dialog')).toBeTruthy();
		expect(ctx.dropRecordParam).not.toHaveBeenCalled();
	});

	it('offers Exempt only when the viewer may configure training types', async () => {
		const user = userEvent.setup();
		const exemptable = { ...fitnessType, canBeExempted: true };
		trainingTypesStore.load([exemptable], 'org-1');
		personnelTrainingsStore.load([], 'org-1');
		const ctx = fakeContext({ recordPerson: person, recordPersonId: 'p1' });
		render(TrainingModals, { props: { ctx: ctx as unknown as TrainingPageContext, modals: new ModalRegistry() } });

		await user.click(await screen.findByRole('button', { name: 'More actions for Fitness' }));
		expect(await screen.findByRole('menuitem', { name: 'Add record' })).toBeTruthy();
		expect(screen.queryByRole('menuitem', { name: 'Exempt' })).toBeNull();
		await user.keyboard('{Escape}');

		ctx.trainingConfigureAffordance = { allowed: true };
		await user.click(await screen.findByRole('button', { name: 'More actions for Fitness' }));
		expect(await screen.findByRole('menuitem', { name: 'Exempt' })).toBeTruthy();
	});
});

describe('TrainingModals Record class host', () => {
	const brooks: Personnel = { ...person, id: 'p1', lastName: 'Brooks', firstName: 'Jalen' };
	const diaz: Personnel = { ...person, id: 'p2', lastName: 'Diaz', firstName: 'Ana' };

	function classContext() {
		const saved = Promise.withResolvers<void>();
		const ctx = $state({
			recordPerson: null,
			recordPersonId: null,
			orgId: 'org-1',
			orgUrlSegment: 'org-1',
			readinessAsOf: '2026-10-25',
			rosterReady: true,
			workspaceIsCurrent: true,
			canRecordTraining: true,
			personnel: [brooks, diaz],
			selectedGroupId: '',
			groupFilterOptions: [{ value: '', label: 'Group: All' }],
			personnelIdsInGroup: () => new Set<string>(),
			trainingConfigureAffordance: { allowed: false },
			recordNeighbours: { previous: null, next: null },
			restoreRecordFocus: vi.fn(),
			dropRecordParam: vi.fn(),
			closeRecord: vi.fn(),
			handleSaveTrainingBatch: vi.fn(() => saved.promise)
		});
		return { ctx, saved };
	}

	function openClass(ctx: ReturnType<typeof classContext>['ctx']) {
		trainingTypesStore.load([fitnessType], 'org-1');
		personnelTrainingsStore.load(
			[
				{
					id: 'r2',
					personnelId: 'p2',
					trainingTypeId: 'fit',
					completionDate: '2026-10-20',
					expirationDate: '2027-10-20',
					notes: null,
					certificateUrl: null
				}
			],
			'org-1'
		);
		const modals = new ModalRegistry();
		modals.open('record-class', { typeId: 'fit' });
		render(TrainingModals, { props: { ctx: ctx as unknown as TrainingPageContext, modals } });
		return modals;
	}

	it('records only the checked Soldiers, leaving a current Soldier out until checked', async () => {
		const { ctx, saved } = classContext();
		const modals = openClass(ctx);
		expect((await screen.findByLabelText(/Brooks, Jalen/)).getAttribute('aria-checked')).toBe('true');
		expect(screen.getByLabelText(/Diaz, Ana/).getAttribute('aria-checked')).toBe('false');

		await fireEvent.click(screen.getByRole('button', { name: 'Record 1' }));
		saved.resolve();

		await waitFor(() => expect(modals.isOpen('record-class')).toBe(false));
		expect(ctx.handleSaveTrainingBatch).toHaveBeenCalledExactlyOnceWith([
			{ personnelId: 'p1', trainingTypeId: 'fit', completionDate: '2026-10-25', status: 'completed' }
		]);
	});

	it('offers Retry when the dialog fails to load, and opens it on Retry', async () => {
		loadRecordClassDialog.mockRejectedValueOnce(new Error('chunk failed'));
		const { ctx } = classContext();
		openClass(ctx);

		await fireEvent.click(await screen.findByRole('button', { name: 'Retry' }));

		expect((await screen.findByLabelText(/Brooks, Jalen/)).getAttribute('aria-checked')).toBe('true');
	});

	it('closes the dialog when the Organization changes, and a save that lands later opens nothing', async () => {
		const { ctx, saved } = classContext();
		const modals = openClass(ctx);
		await fireEvent.click(await screen.findByRole('button', { name: 'Record 1' }));

		ctx.workspaceIsCurrent = false;
		await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
		expect(modals.isOpen('record-class')).toBe(false);

		saved.resolve();
		await Promise.resolve();
		expect(screen.queryByRole('dialog')).toBeNull();
		expect(modals.isOpen('record-class')).toBe(false);
	});
});
