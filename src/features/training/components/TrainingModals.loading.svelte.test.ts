// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Personnel } from '$features/personnel/contracts';
import { trainingTypesStore } from '$features/training/stores/trainingTypes.svelte';
import { personnelTrainingsStore } from '$features/training/stores/personnelTrainings.svelte';
import type { TrainingPageContext } from '$features/training/contexts/TrainingPageContext.svelte';
import { ModalRegistry } from '$lib/utils/modalRegistry.svelte';

const download = vi.hoisted(() => {
	let release!: () => void;
	const released = new Promise<void>((resolve) => (release = resolve));
	return { released, release };
});

vi.mock('$app/navigation', () => ({ beforeNavigate: vi.fn() }));
vi.mock('./TrainingRecordSheet.svelte', async (importOriginal) => {
	await download.released;
	return importOriginal();
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

afterEach(cleanup);

describe('TrainingModals record sheet while its code downloads', () => {
	it('shows the Soldier’s sheet with a skeleton, then the record', async () => {
		trainingTypesStore.load([], 'org-1');
		personnelTrainingsStore.load([], 'org-1');
		const ctx = $state({
			recordPerson: person,
			recordPersonId: 'p1',
			orgId: 'org-1',
			orgUrlSegment: 'org-1',
			readinessAsOf: '2026-10-25',
			rosterReady: true,
			trainingConfigureAffordance: { allowed: false },
			recordNeighbours: { previous: null, next: null },
			restoreRecordFocus: vi.fn(),
			dropRecordParam: vi.fn(),
			closeRecord: vi.fn()
		});
		render(TrainingModals, { props: { ctx: ctx as unknown as TrainingPageContext, modals: new ModalRegistry() } });

		expect(screen.getByRole('dialog', { name: 'PFC Jalen Brooks' })).toBeTruthy();
		expect(screen.getByRole('status')).toBeTruthy();
		expect(screen.queryByRole('link', { name: 'Open profile' })).toBeNull();

		download.release();

		expect(await screen.findByRole('link', { name: 'Open profile' })).toBeTruthy();
		expect(screen.queryByRole('status')).toBeNull();
	});
});
