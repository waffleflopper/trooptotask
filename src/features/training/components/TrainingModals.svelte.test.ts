// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Personnel } from '$features/personnel/contracts';
import { trainingTypesStore } from '$features/training/stores/trainingTypes.svelte';
import { personnelTrainingsStore } from '$features/training/stores/personnelTrainings.svelte';
import type { TrainingPageContext } from '$features/training/contexts/TrainingPageContext.svelte';
import { ModalRegistry } from '$lib/utils/modalRegistry.svelte';
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

function fakeContext(initial: { recordPerson: Personnel | null; recordPersonId: string | null }) {
	const ctx = $state({
		...initial,
		orgId: 'org-1',
		orgUrlSegment: 'org-1',
		readinessAsOf: '2026-10-25',
		rosterReady: true,
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
});
