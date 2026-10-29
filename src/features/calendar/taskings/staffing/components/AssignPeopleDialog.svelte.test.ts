// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Tasking } from '../../taskingModel';
import type { StaffingPicker, TaskingStaffing } from '../staffingModel';
import AssignPeopleDialog from './AssignPeopleDialog.svelte';

const ALPHA = '00000000-0000-4000-8000-000000000201';
const ALICE = '00000000-0000-4000-8000-000000000501';
const BRUNO = '00000000-0000-4000-8000-000000000502';
const tasking: Tasking = {
	id: '00000000-0000-4000-8000-000000000101',
	title: 'Provide four trauma-lane medics',
	event: null,
	responsibility: { kind: 'group', groupId: ALPHA },
	suspenseOn: '2030-10-23',
	execution: { startsOn: '2030-10-19', endsOn: '2030-10-23', reportTime: null },
	requirement: { count: 2, qualifications: null },
	instructions: null,
	status: { kind: 'open' },
	readiness: { equipment: null, checklist: null }
};
const nobody: TaskingStaffing = { revision: 0, picked: 0, needsReview: 0, outsideScope: 0, picks: [] };
const picker: StaffingPicker = {
	tasking: { requirement: tasking.requirement, execution: tasking.execution },
	states: {},
	staffing: nobody,
	candidates: [
		{
			personnelId: ALICE,
			rank: 'SPC',
			firstName: 'Alice',
			lastName: 'Avery',
			groupId: ALPHA,
			mos: '68W',
			clinicRole: ''
		},
		{
			personnelId: BRUNO,
			rank: 'SGT',
			firstName: 'Bruno',
			lastName: 'Baker',
			groupId: ALPHA,
			mos: '68W',
			clinicRole: ''
		}
	],
	advisories: { kind: 'loaded', byPerson: {} }
};
const brunoSaved: TaskingStaffing = {
	revision: 1,
	picked: 1,
	needsReview: 0,
	outsideScope: 0,
	picks: [
		{
			personnelId: BRUNO,
			rank: 'SGT',
			firstName: 'Bruno',
			lastName: 'Baker',
			groupId: ALPHA,
			mos: '68W',
			clinicRole: '',
			archived: false,
			selectedAt: '2030-10-01T00:00:00Z',
			reviewSince: null
		}
	]
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

function serve(...saves: Response[]) {
	return serveFrom(picker, ...saves);
}

function serveFrom(loaded: StaffingPicker, ...saves: Response[]) {
	const sent: unknown[] = [];
	vi.stubGlobal(
		'fetch',
		vi.fn(async (_url: string, init?: RequestInit) => {
			if (!init?.method) return json(loaded);
			sent.push(JSON.parse(String(init.body)));
			return saves.shift() ?? json({ message: 'unexpected' }, 500);
		})
	);
	return sent;
}

function open(onSaved = vi.fn()) {
	render(AssignPeopleDialog, {
		orgId: 'org-a',
		tasking,
		groupCatalog: [{ id: ALPHA, name: 'Alpha', sortOrder: 0, parentId: null, depth: 1 }],
		groups: { [ALPHA]: 'Alpha' },
		onSaved,
		onClose: vi.fn()
	});
	return onSaved;
}

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

describe('AssignPeopleDialog', () => {
	it('filters by the MOS the loaded requirement names when the caller passed only a count', async () => {
		serveFrom({ ...picker, tasking: { ...picker.tasking, requirement: { count: 2, qualifications: '68W' } } });
		open();

		expect(await screen.findByRole('button', { name: '68W', pressed: true })).toBeTruthy();
	});

	it('keeps the operator’s choices when someone else saved first, and saves them against the new revision', async () => {
		const sent = serve(
			json({ outcome: 'conflict', staffing: brunoSaved }, 409),
			json({ outcome: 'saved', staffing: nobody })
		);
		const onSaved = open();

		await fireEvent.click(await screen.findByRole('checkbox', { name: /Avery/ }));
		await fireEvent.click(screen.getByRole('button', { name: /Save \d/ }));

		await waitFor(() => expect(sent).toHaveLength(1));
		await waitFor(() => expect(screen.getByRole('button', { name: /Save \d/ }).hasAttribute('disabled')).toBe(false));
		expect(screen.getByRole('checkbox', { name: /Avery/ }).getAttribute('aria-checked')).toBe('true');
		expect(onSaved).not.toHaveBeenCalled();

		await fireEvent.click(screen.getByRole('button', { name: /Save \d/ }));
		await waitFor(() => expect(onSaved).toHaveBeenCalled());
		expect(sent).toMatchObject([
			{ personnelIds: [ALICE], expectedRevision: 0 },
			{ personnelIds: [ALICE], expectedRevision: 1 }
		]);
	});

	it('keeps the draft after a failed save so the operator can retry', async () => {
		serve(json({ message: 'Service unavailable' }, 503));
		const onSaved = open();

		await fireEvent.click(await screen.findByRole('checkbox', { name: /Baker/ }));
		await fireEvent.click(screen.getByRole('button', { name: /Save \d/ }));

		await waitFor(() => expect(screen.getByRole('button', { name: /Save \d/ }).hasAttribute('disabled')).toBe(false));
		expect(screen.getByRole('checkbox', { name: /Baker/ }).getAttribute('aria-checked')).toBe('true');
		expect(onSaved).not.toHaveBeenCalled();
	});

	it('stays busy until the caller has finished with the saved picks', async () => {
		serve(json({ outcome: 'saved', staffing: nobody }));
		let finish!: () => void;
		const onSaved = open(vi.fn(() => new Promise<void>((resolve) => (finish = resolve))));

		await fireEvent.click(await screen.findByRole('checkbox', { name: /Baker/ }));
		await fireEvent.click(screen.getByRole('button', { name: /Save \d/ }));
		await waitFor(() => expect(onSaved).toHaveBeenCalled());
		await new Promise((resolve) => setTimeout(resolve));

		expect(screen.getByRole('button', { name: /Save \d/ }).hasAttribute('disabled')).toBe(true);
		finish();
		await waitFor(() => expect(screen.getByRole('button', { name: /Save \d/ }).hasAttribute('disabled')).toBe(false));
	});

	it('hands the caller the selection it opened on, so the save can be undone', async () => {
		serve(json({ outcome: 'saved', staffing: brunoSaved }));
		const onSaved = open();

		await fireEvent.click(await screen.findByRole('checkbox', { name: /Baker/ }));
		await fireEvent.click(screen.getByRole('button', { name: /Save \d/ }));

		await waitFor(() => expect(onSaved).toHaveBeenCalledWith({ outcome: 'saved', staffing: brunoSaved }, nobody));
	});

	it('drops a person from the selection when their chip is removed', async () => {
		const sent = serve(json({ outcome: 'saved', staffing: nobody }));
		open();

		await fireEvent.click(await screen.findByRole('checkbox', { name: /Avery/ }));
		await fireEvent.click(await screen.findByRole('checkbox', { name: /Baker/ }));
		await fireEvent.click(screen.getByRole('button', { name: /Remove .*Avery/ }));
		await fireEvent.click(screen.getByRole('button', { name: /Save \d/ }));

		await waitFor(() => expect(sent).toMatchObject([{ personnelIds: [BRUNO] }]));
		expect(screen.getByRole('checkbox', { name: /Avery/ }).getAttribute('aria-checked')).toBe('false');
	});

	it('narrows the roster to people matching the search', async () => {
		serve();
		open();

		await fireEvent.input(await screen.findByRole('searchbox'), { target: { value: 'bak' } });

		await waitFor(() => expect(screen.queryByRole('checkbox', { name: /Avery/ })).toBeNull());
		expect(screen.getByRole('checkbox', { name: /Baker/ })).toBeTruthy();
	});
});
