import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { toastStore } from '$lib/stores/toast.svelte';
import type { Group } from '../../contracts';
import type { Personnel } from '../../personnel.types';
import { RosterQuickEdit, type QuickEditDeps } from './quickEdit.svelte';

const groups: Group[] = [
	{ id: 'g-1', name: '1st Platoon', sortOrder: 0 },
	{ id: 'g-2', name: '2nd Platoon', sortOrder: 1 }
];

const okafor: Personnel = {
	id: 'p-1',
	slug: 'okafor-daniel',
	rank: 'SGT',
	lastName: 'Okafor',
	firstName: 'Daniel',
	mos: '68W',
	clinicRole: 'Treatment NCO',
	ets: null,
	deros: null,
	groupId: 'g-2',
	groupName: '2nd Platoon'
};
const patel: Personnel = { ...okafor, id: 'p-2', slug: 'patel-nikhil', lastName: 'Patel', firstName: 'Nikhil' };

function setup(overrides: Partial<QuickEditDeps> = {}) {
	let org = 'org-1';
	let roster = [okafor, patel];
	const deps = {
		orgId: () => org,
		person: (id: string) => roster.find((person) => person.id === id),
		groups: () => groups,
		save: vi.fn<QuickEditDeps['save']>(async (id, data) => {
			roster = roster.map((person) => (person.id === id ? { ...person, ...data, slug: 'okafor-dan' } : person));
			return true;
		}),
		refreshSignals: vi.fn<QuickEditDeps['refreshSignals']>(),
		dataSheetHref: (person: Personnel) => `/personnel/${person.slug}/data-sheet`,
		navigate: vi.fn<QuickEditDeps['navigate']>(),
		closed: vi.fn<QuickEditDeps['closed']>(),
		...overrides
	} satisfies QuickEditDeps;
	return {
		deps,
		edit: new RosterQuickEdit(deps),
		switchOrg: (next: string) => (org = next),
		removeFromRoster: (id: string) => (roster = roster.filter((person) => person.id !== id))
	};
}

beforeEach(() => {
	vi.spyOn(toastStore, 'success').mockImplementation(() => 'toast-id');
});

afterEach(() => {
	vi.restoreAllMocks();
});

describe('one editor at a time', () => {
	it('moves to another row at once when nothing is unsaved', () => {
		const { edit } = setup();
		edit.open(okafor);
		edit.open(patel);

		expect(edit.editingId).toBe('p-2');
		expect(edit.prompt).toBeNull();
	});

	it('asks before dropping unsaved changes, and keeps the editor when the user declines', () => {
		const { edit } = setup();
		edit.open(okafor);
		edit.session!.draft.clinicRole = 'Senior Treatment NCO';
		edit.open(patel);

		expect(edit.prompt).toEqual({ kind: 'discard', next: patel });
		edit.decideDiscard(false);
		expect(edit.editingId).toBe('p-1');
		expect(edit.session!.draft.clinicRole).toBe('Senior Treatment NCO');

		edit.open(patel);
		edit.decideDiscard(true);
		expect(edit.editingId).toBe('p-2');
		expect(edit.session!.draft.clinicRole).toBe('Treatment NCO');
	});

	it('closes from the pencil, asking first when there are unsaved changes', () => {
		const { edit, deps } = setup();
		edit.open(okafor);
		edit.toggle(okafor);
		expect(edit.editingId).toBeNull();
		expect(deps.closed).toHaveBeenCalledWith('p-1');

		edit.open(okafor);
		edit.session!.draft.mos = '68C';
		edit.toggle(okafor);
		expect(edit.prompt).toEqual({ kind: 'discard', next: null });
		edit.decideDiscard(true);
		expect(edit.editingId).toBeNull();
	});

	it('closes when its Person leaves the roster', () => {
		const { edit, removeFromRoster } = setup();
		edit.open(okafor);
		removeFromRoster('p-1');
		edit.closeIfGone();

		expect(edit.editingId).toBeNull();
	});
});

describe('save', () => {
	it('sends nothing without changes or with a blank required field, and reports the blank field once tried', async () => {
		const { edit, deps } = setup();
		edit.open(okafor);

		expect(await edit.save()).toBe(false);
		edit.session!.draft.lastName = '  ';
		expect(await edit.save()).toBe(false);

		expect(deps.save).not.toHaveBeenCalled();
		expect(edit.session!.errors).toEqual({ lastName: 'Enter a last name.' });
		expect(edit.session!.attempted).toBe(true);
	});

	it('writes the draft, closes the editor and rereads signals when rank, MOS, duty role or Group changed', async () => {
		const { edit, deps } = setup();
		edit.open(okafor);
		edit.session!.draft.rank = 'SSG';
		edit.session!.draft.groupId = 'g-1';

		expect(await edit.save()).toBe(true);

		expect(deps.save).toHaveBeenCalledExactlyOnceWith('p-1', {
			rank: 'SSG',
			lastName: 'Okafor',
			firstName: 'Daniel',
			mos: '68W',
			clinicRole: 'Treatment NCO',
			ets: null,
			deros: null,
			groupId: 'g-1',
			groupName: '1st Platoon'
		});
		expect(deps.refreshSignals).toHaveBeenCalledExactlyOnceWith(['p-1']);
		expect(deps.closed).toHaveBeenCalledWith('p-1');
		expect(edit.editingId).toBeNull();
	});

	it('leaves signals alone when only dates or names changed', async () => {
		const { edit, deps } = setup();
		edit.open(okafor);
		edit.session!.draft.ets = '2027-03-14';
		edit.session!.draft.firstName = 'Dan';

		expect(await edit.save()).toBe(true);

		expect(deps.refreshSignals).not.toHaveBeenCalled();
	});

	it('keeps the editor open with its values and the error when the write fails, then saves on retry', async () => {
		const save = vi
			.fn<QuickEditDeps['save']>()
			.mockRejectedValueOnce(new Error('Group is no longer available'))
			.mockResolvedValueOnce(true);
		const { edit, deps } = setup({ save });
		edit.open(okafor);
		edit.session!.draft.clinicRole = 'Senior Treatment NCO';

		expect(await edit.save()).toBe(false);
		expect(edit.session).toMatchObject({ error: 'Group is no longer available', saving: false });
		expect(edit.session!.draft.clinicRole).toBe('Senior Treatment NCO');
		expect(deps.refreshSignals).not.toHaveBeenCalled();

		expect(await edit.save()).toBe(true);
		expect(edit.editingId).toBeNull();
	});

	it('does nothing after the write when the Organization changed meanwhile', async () => {
		let release!: () => void;
		const { edit, deps, switchOrg } = setup({
			save: vi.fn(() => new Promise<boolean>((resolve) => (release = () => resolve(true))))
		});
		edit.open(okafor);
		edit.session!.draft.rank = 'SSG';
		const saving = edit.save();
		switchOrg('org-2');
		release();

		expect(await saving).toBe(false);
		expect(deps.refreshSignals).not.toHaveBeenCalled();
		expect(deps.closed).not.toHaveBeenCalled();
		expect(toastStore.success).not.toHaveBeenCalled();
	});

	it('ignores a second Save, another row and Cancel while the write is in flight', async () => {
		let release!: () => void;
		const { edit, deps } = setup({
			save: vi.fn(() => new Promise<boolean>((resolve) => (release = () => resolve(true))))
		});
		edit.open(okafor);
		edit.session!.draft.mos = '68C';
		const first = edit.save();
		await edit.save();
		edit.open(patel);
		edit.cancel();

		expect(deps.save).toHaveBeenCalledTimes(1);
		expect(edit.editingId).toBe('p-1');
		release();
		expect(await first).toBe(true);
	});
});

describe('Full data sheet', () => {
	it('opens straight away when nothing is unsaved', () => {
		const { edit, deps } = setup();
		edit.open(okafor);
		edit.openDataSheet();

		expect(deps.navigate).toHaveBeenCalledExactlyOnceWith('/personnel/okafor-daniel/data-sheet');
	});

	it('asks first with unsaved changes, and Cancel stays put', async () => {
		const { edit, deps } = setup();
		edit.open(okafor);
		edit.session!.draft.mos = '68C';
		edit.openDataSheet();
		expect(edit.prompt).toEqual({ kind: 'data-sheet' });

		await edit.decideDataSheet('cancel');
		expect(edit.prompt).toBeNull();
		expect(edit.editingId).toBe('p-1');
		expect(deps.navigate).not.toHaveBeenCalled();
	});

	it('saves then opens the sheet at the slug the save produced', async () => {
		const { edit, deps } = setup();
		edit.open(okafor);
		edit.session!.draft.firstName = 'Dan';
		edit.openDataSheet();
		await edit.decideDataSheet('save');

		expect(deps.save).toHaveBeenCalledTimes(1);
		expect(deps.navigate).toHaveBeenCalledExactlyOnceWith('/personnel/okafor-dan/data-sheet');
	});

	it('discards and opens without writing', async () => {
		const { edit, deps } = setup();
		edit.open(okafor);
		edit.session!.draft.firstName = 'Dan';
		edit.openDataSheet();
		await edit.decideDataSheet('discard');

		expect(deps.save).not.toHaveBeenCalled();
		expect(deps.navigate).toHaveBeenCalledExactlyOnceWith('/personnel/okafor-daniel/data-sheet');
	});

	it('stays on the failed save instead of opening the sheet', async () => {
		const { edit, deps } = setup({ save: vi.fn().mockRejectedValue(new Error('Denied')) });
		edit.open(okafor);
		edit.session!.draft.firstName = 'Dan';
		edit.openDataSheet();
		await edit.decideDataSheet('save');

		expect(deps.navigate).not.toHaveBeenCalled();
		expect(edit.prompt).toBeNull();
		expect(edit.session!.error).toBe('Denied');
	});
});
