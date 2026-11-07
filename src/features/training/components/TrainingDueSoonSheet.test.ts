// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Personnel } from '$features/personnel/contracts';
import type { TrainingType } from '../training.types';
import type { TrainingDueSoon } from '../utils/dueSoon';
import TrainingDueSoonSheet from './TrainingDueSoonSheet.svelte';

const person = (id: string, firstName: string, lastName: string): Personnel => ({
	id,
	rank: 'SPC',
	lastName,
	firstName,
	mos: '68W',
	clinicRole: 'Medic',
	groupId: 'g1',
	groupName: 'Alpha'
});

const personnel = [person('p1', 'Ana', 'Brooks'), person('p2', 'Lee', 'Okafor')];

const type = (id: string, name: string): TrainingType => ({
	id,
	name,
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
	color: '#336699',
	sortOrder: 0,
	expirationDateOnly: false,
	canBeExempted: false,
	exemptPersonnelIds: [],
	isOptional: false
});

const trainingTypes = [type('cpr', 'CPR'), type('hiv', 'HIV')];

const dueSoon: TrainingDueSoon[] = [
	{
		trainingTypeId: 'cpr',
		people: [
			{ personnelId: 'p1', daysLeft: 0, status: 'warning-orange' },
			{ personnelId: 'p2', daysLeft: 45, status: 'warning-yellow' }
		]
	},
	{ trainingTypeId: 'hiv', people: [{ personnelId: 'p2', daysLeft: 12, status: 'warning-orange' }] }
];

function renderSheet(overrides: Partial<Parameters<typeof render<typeof TrainingDueSoonSheet>>[1]> = {}) {
	return render(TrainingDueSoonSheet, {
		props: { dueSoon, personnel, trainingTypes, asOf: '2026-10-25', onClose: vi.fn(), ...overrides }
	});
}

afterEach(cleanup);

describe('TrainingDueSoonSheet', () => {
	it('lists each Soldier under their training with days left and the expiration date', () => {
		renderSheet();

		const cpr = within(screen.getByRole('region', { name: /CPR/ }));
		expect(cpr.getByText('SPC Brooks, Ana')).toBeTruthy();
		expect(cpr.getByText('Today')).toBeTruthy();
		expect(cpr.getByText('Expires 25 Oct 2026')).toBeTruthy();
		expect(cpr.getByText('SPC Okafor, Lee')).toBeTruthy();
		expect(cpr.getByText('45d left')).toBeTruthy();
		expect(cpr.getByText('Expires 9 Dec 2026')).toBeTruthy();

		const hiv = within(screen.getByRole('region', { name: /HIV/ }));
		expect(hiv.getByText('12d left')).toBeTruthy();
		expect(hiv.getByText('Expires 6 Nov 2026')).toBeTruthy();
	});

	it('shows skeleton rows until the lists arrive, then no training lists when nothing is due, then one per training', async () => {
		const { rerender } = renderSheet({ dueSoon: null });
		expect(screen.getByRole('status', { name: 'Loading due soon training' })).toBeTruthy();
		expect(screen.queryAllByRole('region')).toEqual([]);

		await rerender({ dueSoon: [] });
		expect(screen.queryByRole('status')).toBeNull();
		expect(screen.queryAllByRole('region')).toEqual([]);

		await rerender({ dueSoon });
		expect(screen.queryByRole('status')).toBeNull();
		expect(screen.getByRole('region', { name: /CPR/ })).toBeTruthy();
		expect(screen.getByRole('region', { name: /HIV/ })).toBeTruthy();
	});

	it('offers Record class per training only where the viewer may record, passing that training', async () => {
		const onRecordClass = vi.fn();
		const { unmount } = renderSheet({ onRecordClass });

		await fireEvent.click(
			within(screen.getByRole('region', { name: /HIV/ })).getByRole('button', { name: 'Record class' })
		);
		expect(onRecordClass).toHaveBeenCalledExactlyOnceWith('hiv');

		unmount();
		renderSheet();
		expect(screen.queryByRole('button', { name: 'Record class' })).toBeNull();
	});
});
