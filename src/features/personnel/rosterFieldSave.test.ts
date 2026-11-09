import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { endOrganizationLifetime, StoreRequestError } from '$lib/stores/core';
import { settles } from '$lib/test-support/settles';
import type { PersonnelFieldBulkResult } from './contracts';
import type { Personnel } from './personnel.types';
import { saveRosterField, type RosterFieldSaveDeps } from './rosterFieldSave';
import { personnelStore } from './stores/personnel.svelte';

const person = (id: string, rank: string): Personnel => ({
	id,
	rank,
	lastName: id,
	firstName: 'Pat',
	mos: '68W',
	clinicRole: 'Medic',
	groupId: null,
	groupName: ''
});
const roster = [person('a', 'SGT'), person('b', 'SGT'), person('c', 'SGT')];

function setup(reply: Promise<PersonnelFieldBulkResult>, isCurrent = () => true) {
	const peek = { changed: vi.fn() };
	const refreshSignals = vi.fn();
	const deps: RosterFieldSaveDeps = {
		orgId: 'org-1',
		isCurrent,
		peek,
		refreshSignals,
		save: vi.fn(async () => reply)
	};
	return { deps, peek, refreshSignals };
}
const ranks = () => personnelStore.items.map((item) => [item.id, item.rank]);

describe('saveRosterField', () => {
	beforeEach(() => personnelStore.load(roster, 'org-1'));
	afterEach(() => personnelStore.load([], 'org-1'));

	it('changes the roster only for the People the server updated', async () => {
		const reply: PersonnelFieldBulkResult = {
			field: 'rank',
			value: 'SSG',
			updatedIds: ['a'],
			refusedIds: ['b'],
			unavailableIds: ['c']
		};
		const { deps, peek, refreshSignals } = setup(Promise.resolve(reply));

		await expect(saveRosterField(roster, { field: 'rank', value: 'ssg' }, ['a', 'b', 'c'], deps)).resolves.toEqual({
			answered: reply,
			interrupted: null
		});

		expect(ranks()).toEqual([
			['a', 'SSG'],
			['b', 'SGT'],
			['c', 'SGT']
		]);
		expect(peek.changed).toHaveBeenCalledOnce();
		expect(peek.changed).toHaveBeenCalledWith('a', roster[0], { ...roster[0], rank: 'SSG' });
		expect(refreshSignals).toHaveBeenCalledWith(['a']);
	});

	const updateAll: NonNullable<RosterFieldSaveDeps['save']> = async (_orgId, ids) => ({
		field: 'rank',
		value: 'SSG',
		updatedIds: ids,
		refusedIds: [],
		unavailableIds: []
	});
	const idsOf = (people: Personnel[]) => people.map((item) => item.id);

	it('saves more than 500 People in batches and keeps the confirmed batch when a later reply is lost', async () => {
		const many = Array.from({ length: 501 }, (_, index) => person(`p${index}`, 'SGT'));
		personnelStore.load(many, 'org-1');
		const save = vi
			.fn<NonNullable<RosterFieldSaveDeps['save']>>()
			.mockImplementationOnce(updateAll)
			.mockRejectedValueOnce(new TypeError('fetch failed'));
		const { deps, refreshSignals } = setup(new Promise<PersonnelFieldBulkResult>(() => {}));

		const result = await saveRosterField(many, { field: 'rank', value: 'SSG' }, idsOf(many), { ...deps, save });

		expect(result).toEqual({
			answered: {
				field: 'rank',
				value: 'SSG',
				updatedIds: idsOf(many.slice(0, 500)),
				refusedIds: [],
				unavailableIds: []
			},
			interrupted: {
				outcome: 'unconfirmed',
				failedIds: ['p500'],
				unsentIds: [],
				message: "We couldn't confirm the change. Reload to see what saved."
			}
		});
		expect(save.mock.calls.map(([, ids]) => ids.length)).toEqual([500, 1]);
		expect(personnelStore.items.filter((item) => item.rank === 'SSG')).toHaveLength(500);
		expect(personnelStore.items.find((item) => item.id === 'p500')?.rank).toBe('SGT');
		expect(refreshSignals).toHaveBeenCalledOnce();
	});

	it('reports a refused batch as not saved with the server reason, and the batches after it as never sent', async () => {
		const many = Array.from({ length: 1001 }, (_, index) => person(`p${index}`, 'SGT'));
		personnelStore.load(many, 'org-1');
		const save = vi
			.fn<NonNullable<RosterFieldSaveDeps['save']>>()
			.mockImplementationOnce(updateAll)
			.mockRejectedValueOnce(new StoreRequestError('Unknown rank "SSG".', 400, true));
		const { deps } = setup(new Promise<PersonnelFieldBulkResult>(() => {}));

		const { answered, interrupted } = await saveRosterField(many, { field: 'rank', value: 'SSG' }, idsOf(many), {
			...deps,
			save
		});

		expect(answered.updatedIds).toEqual(idsOf(many.slice(0, 500)));
		expect(interrupted).toEqual({
			outcome: 'not-saved',
			failedIds: idsOf(many.slice(500, 1000)),
			unsentIds: ['p1000'],
			message: 'Unknown rank "SSG".'
		});
		expect(save).toHaveBeenCalledTimes(2);
	});

	it('writes nothing and never settles when the reply arrives after the Organization shell ends', async () => {
		let reply!: (result: PersonnelFieldBulkResult) => void;
		const { deps, peek, refreshSignals } = setup(new Promise((resolve) => (reply = resolve)));

		const pending = saveRosterField(roster, { field: 'rank', value: 'SSG' }, ['a', 'b'], deps);
		endOrganizationLifetime();
		reply({ field: 'rank', value: 'SSG', updatedIds: ['a', 'b'], refusedIds: [], unavailableIds: [] });

		expect(await settles(pending)).toBe(false);
		expect(ranks()).toEqual([
			['a', 'SGT'],
			['b', 'SGT'],
			['c', 'SGT']
		]);
		expect(peek.changed).not.toHaveBeenCalled();
		expect(refreshSignals).not.toHaveBeenCalled();
	});

	it('writes nothing and never settles when the roster that started the save is no longer current', async () => {
		let current = true;
		let reply!: (result: PersonnelFieldBulkResult) => void;
		const { deps, peek } = setup(new Promise((resolve) => (reply = resolve)), () => current);

		const pending = saveRosterField(roster, { field: 'mos', value: '68X' }, ['a'], deps);
		current = false;
		reply({ field: 'mos', value: '68X', updatedIds: ['a'], refusedIds: [], unavailableIds: [] });

		expect(await settles(pending)).toBe(false);
		expect(personnelStore.items.map((item) => item.mos)).toEqual(['68W', '68W', '68W']);
		expect(peek.changed).not.toHaveBeenCalled();
	});
});
