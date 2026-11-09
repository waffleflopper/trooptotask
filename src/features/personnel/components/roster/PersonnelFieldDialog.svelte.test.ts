// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StoreRequestError } from '$lib/stores/core';
import type { PersonnelFieldChange } from '../../contracts';
import type { Personnel } from '../../personnel.types';
import { saveRosterField, type RosterFieldSaveDeps } from '../../rosterFieldSave';
import PersonnelFieldDialog from './PersonnelFieldDialog.svelte';

const person = (index: number): Personnel => ({
	id: `p${index}`,
	rank: 'SGT',
	lastName: `Medic${index}`,
	firstName: 'Pat',
	mos: '68W',
	clinicRole: 'Medic',
	groupId: null,
	groupName: ''
});

function open(people: Personnel[], save: NonNullable<RosterFieldSaveDeps['save']>) {
	const ondone = vi.fn();
	render(PersonnelFieldDialog, {
		people,
		notEditable: 0,
		rankCodes: ['SGT', 'SSG'],
		onsave: (change: PersonnelFieldChange, ids: string[]) =>
			saveRosterField(people, change, ids, {
				orgId: 'org-1',
				isCurrent: () => true,
				peek: { changed: () => {} },
				refreshSignals: () => {},
				save
			}),
		ondone,
		onclose: () => {}
	});
	return { ondone };
}

async function saveRank(rank: string) {
	await fireEvent.change(screen.getByLabelText('New Rank'), { target: { value: rank } });
	await fireEvent.click(screen.getByRole('button', { name: 'Review changes' }));
	await fireEvent.click(screen.getByRole('button', { name: /^Save/ }));
}

const outcomeFor = (name: string) =>
	within(
		within(screen.getByRole('list', { name: 'Results' }))
			.getByText(name)
			.closest('li')!
	).getByText(/Updated|Not confirmed|Not saved|No access|No longer available/).textContent;

describe('PersonnelFieldDialog', () => {
	afterEach(() => cleanup());

	it('shows the People a confirmed batch updated, and the rest as not confirmed, when a later batch is lost', async () => {
		const people = Array.from({ length: 501 }, (_, index) => person(index));
		const save = vi
			.fn<NonNullable<RosterFieldSaveDeps['save']>>()
			.mockImplementationOnce(async (_orgId, ids) => ({
				field: 'rank',
				value: 'SSG',
				updatedIds: ids,
				refusedIds: [],
				unavailableIds: []
			}))
			.mockRejectedValueOnce(new TypeError('fetch failed'));
		const { ondone } = open(people, save);

		await saveRank('SSG');

		await screen.findByRole('list', { name: 'Results' });
		expect([outcomeFor('SGT Medic0, Pat'), outcomeFor('SGT Medic499, Pat'), outcomeFor('SGT Medic500, Pat')]).toEqual([
			'Updated',
			'Updated',
			'Not confirmed'
		]);
		expect(screen.getByRole('alert')).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Reload' })).toBeTruthy();
		expect(ondone).not.toHaveBeenCalled();
	});

	it('keeps the review in place with the reason when the first batch is refused', async () => {
		const people = [person(0), person(1)];
		open(people, async () => {
			throw new StoreRequestError('Unknown rank "SSG".', 400, true);
		});

		await saveRank('SSG');

		const alert = await screen.findByRole('alert');
		expect(alert.textContent).toContain('Unknown rank "SSG".');
		expect(screen.getByRole('list', { name: 'Changes to review' })).toBeTruthy();
		expect(screen.queryByRole('list', { name: 'Results' })).toBeNull();
	});
});
