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
	tasking: { requirement: null, execution: null },
	states: {},
	staffing: nobody,
	candidates: [
		{ personnelId: ALICE, rank: 'SPC', firstName: 'Alice', lastName: 'Avery', groupId: ALPHA },
		{ personnelId: BRUNO, rank: 'SGT', firstName: 'Bruno', lastName: 'Baker', groupId: ALPHA }
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
			archived: false,
			selectedAt: '2030-10-01T00:00:00Z',
			reviewSince: null
		}
	]
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

function serve(...saves: Response[]) {
	const sent: unknown[] = [];
	vi.stubGlobal(
		'fetch',
		vi.fn(async (_url: string, init?: RequestInit) => {
			if (!init?.method) return json(picker);
			sent.push(JSON.parse(String(init.body)));
			return saves.shift() ?? json({ message: 'unexpected' }, 500);
		})
	);
	return sent;
}

function open(onSaved = vi.fn()) {
	render(AssignPeopleDialog, { orgId: 'org-a', tasking, groups: { [ALPHA]: 'Alpha' }, onSaved, onClose: vi.fn() });
	return onSaved;
}

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

describe('AssignPeopleDialog', () => {
	it('keeps the operator’s choices when someone else saved first, and saves them against the new revision', async () => {
		const sent = serve(
			json({ outcome: 'conflict', staffing: brunoSaved }, 409),
			json({ outcome: 'saved', staffing: nobody })
		);
		const onSaved = open();

		await fireEvent.click(await screen.findByRole('checkbox', { name: /Avery/ }));
		await fireEvent.click(screen.getByRole('button', { name: 'Save people' }));

		await waitFor(() => expect(sent).toHaveLength(1));
		await waitFor(() =>
			expect(screen.getByRole('button', { name: 'Save people' }).hasAttribute('disabled')).toBe(false)
		);
		expect(screen.getByRole('checkbox', { name: /Avery/ }).getAttribute('aria-checked')).toBe('true');
		expect(onSaved).not.toHaveBeenCalled();

		await fireEvent.click(screen.getByRole('button', { name: 'Save people' }));
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
		await fireEvent.click(screen.getByRole('button', { name: 'Save people' }));

		await waitFor(() =>
			expect(screen.getByRole('button', { name: 'Save people' }).hasAttribute('disabled')).toBe(false)
		);
		expect(screen.getByRole('checkbox', { name: /Baker/ }).getAttribute('aria-checked')).toBe('true');
		expect(onSaved).not.toHaveBeenCalled();
	});

	it('stays busy until the caller has finished with the saved picks', async () => {
		serve(json({ outcome: 'saved', staffing: nobody }));
		let finish!: () => void;
		const onSaved = open(vi.fn(() => new Promise<void>((resolve) => (finish = resolve))));

		await fireEvent.click(await screen.findByRole('checkbox', { name: /Baker/ }));
		await fireEvent.click(screen.getByRole('button', { name: 'Save people' }));
		await waitFor(() => expect(onSaved).toHaveBeenCalled());
		await new Promise((resolve) => setTimeout(resolve));

		expect(screen.getByRole('button', { name: /Save people/ }).hasAttribute('disabled')).toBe(true);
		finish();
		await waitFor(() =>
			expect(screen.getByRole('button', { name: /Save people/ }).hasAttribute('disabled')).toBe(false)
		);
	});
});
