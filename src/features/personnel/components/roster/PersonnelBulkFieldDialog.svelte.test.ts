// @vitest-environment happy-dom
import { createClientAccess } from '$lib/access/clientAccess';
import { createCapabilityMap } from '$lib/access/memberAccessShape';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { endOrganizationLifetime } from '$lib/stores/core';
import { toastStore } from '$lib/stores/toast.svelte';
import { ModalRegistry } from '$lib/utils/modalRegistry.svelte';
import { RosterSignals } from '../../rosterSignals.svelte';
import { PersonnelPageContext } from '../../contexts/PersonnelPageContext.svelte';
import type { Personnel } from '../../personnel.types';
import { personnelStore } from '../../stores/personnel.svelte';
import PersonnelBulkFieldDialog from './PersonnelBulkFieldDialog.svelte';

vi.mock('$app/navigation', () => ({ goto: vi.fn(), invalidate: vi.fn() }));

afterEach(async () => {
	cleanup();
	await new Promise((resolve) => setTimeout(resolve, 30));
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

const person = (id: string, lastName: string, mos: string): Personnel => ({
	id,
	rank: 'SGT',
	lastName,
	firstName: 'Pat',
	mos,
	clinicRole: '',
	ets: null,
	groupId: null,
	groupName: '',
	archivedAt: null
});

const refreshed: string[][] = [];

function setup(people: Personnel[], skipped = 0) {
	refreshed.length = 0;
	personnelStore.load(people, 'org-a');
	const ctx = new PersonnelPageContext(
		{ orgId: 'org-a', asOf: '2026-10-23', orgName: 'A', pinnedGroups: [] },
		new ModalRegistry(),
		createClientAccess({
			membershipRole: 'member',
			capabilityMap: { ...createCapabilityMap('none'), personnel: 'operate' },
			scopeSet: { kind: 'organization' }
		}),
		personnelStore,
		[],
		new RosterSignals({
			readPeople: async (_orgId, ids) => {
				refreshed.push(ids);
				throw new Error('not under test');
			}
		})
	);
	const onclose = vi.fn();
	render(PersonnelBulkFieldDialog, { props: { ctx, people, skipped, isCurrent: () => true, onclose } });
	return { onclose };
}

async function chooseMos(value: string) {
	await fireEvent.click(screen.getByRole('radio', { name: 'MOS' }));
	await fireEvent.input(screen.getByLabelText('New MOS'), { target: { value } });
}

const roster = () => [person('a', 'Able', '68W'), person('b', 'Baker', '68C'), person('c', 'Cole', '')];

describe('Set field dialog', () => {
	it('reviews only the People whose value changes and saves just those', async () => {
		const bodies: unknown[] = [];
		vi.stubGlobal(
			'fetch',
			vi.fn(async (_url: string, init: RequestInit) => {
				bodies.push(JSON.parse(init.body as string));
				return Response.json({
					field: 'mos',
					value: '68C',
					results: [
						{ id: 'a', outcome: 'updated' },
						{ id: 'c', outcome: 'updated' }
					]
				});
			})
		);
		const success = vi.spyOn(toastStore, 'success');
		const { onclose } = setup(roster(), 1);

		await chooseMos('68C');

		const review = within(screen.getByRole('region', { name: /Changes/ }));
		const rows = review.getAllByRole('listitem').map((row) => row.textContent?.replace(/\s+/g, ' ').trim());
		expect(rows).toEqual(['SGT Able, Pat 68W → 68C', 'SGT Cole, Pat None → 68C']);
		expect(screen.getByText('1 person already have it and will not change.')).toBeTruthy();
		expect(screen.getByText('1 person you cannot edit will be skipped.')).toBeTruthy();

		await fireEvent.click(screen.getByRole('button', { name: 'Set MOS for 2 people' }));
		await waitFor(() => expect(onclose).toHaveBeenCalled());

		expect(bodies).toEqual([{ personnelIds: ['a', 'c'], field: 'mos', value: '68C' }]);
		expect(personnelStore.getById('a')?.mos).toBe('68C');
		expect(personnelStore.getById('c')?.mos).toBe('68C');
		expect(refreshed).toEqual([['a', 'c']]);
		expect(success).toHaveBeenCalledWith('Set MOS to 68C for 2 people · 1 person already had it · 1 person skipped');
	});

	it('keeps the dialog open to show who was refused and updates only the People who saved', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () =>
				Response.json({
					field: 'mos',
					value: '68X',
					results: [
						{ id: 'a', outcome: 'updated' },
						{ id: 'b', outcome: 'refused', message: 'You do not have access to records outside your assigned scope' }
					]
				})
			)
		);
		const { onclose } = setup([person('a', 'Able', '68W'), person('b', 'Baker', '68C')]);

		await chooseMos('68X');
		await fireEvent.click(screen.getByRole('button', { name: 'Set MOS for 2 people' }));

		const failures = await screen.findByRole('list', { name: 'People that did not save' });
		expect(failures.textContent?.replace(/\s+/g, ' ')).toBe(
			'SGT Baker, Pat Not allowed: You do not have access to records outside your assigned scope'
		);
		expect(onclose).not.toHaveBeenCalled();
		expect(personnelStore.getById('a')?.mos).toBe('68X');
		expect(personnelStore.getById('b')?.mos).toBe('68C');
	});

	it('writes nothing and shows no toast when the answer arrives after an Organization switch', async () => {
		let answer: (response: Response) => void = () => {};
		vi.stubGlobal(
			'fetch',
			vi.fn(() => new Promise<Response>((resolve) => (answer = resolve)))
		);
		const toasts = [
			vi.spyOn(toastStore, 'success'),
			vi.spyOn(toastStore, 'warning'),
			vi.spyOn(toastStore, 'error'),
			vi.spyOn(toastStore, 'info')
		];
		const { onclose } = setup(roster());

		await chooseMos('68C');
		await fireEvent.click(screen.getByRole('button', { name: 'Set MOS for 2 people' }));
		endOrganizationLifetime();
		answer(
			Response.json({
				field: 'mos',
				value: '68C',
				results: [
					{ id: 'a', outcome: 'updated' },
					{ id: 'c', outcome: 'updated' }
				]
			})
		);
		await new Promise((resolve) => setTimeout(resolve, 30));

		expect(personnelStore.items.map((item) => item.mos)).toEqual(['68W', '68C', '']);
		expect(toasts.map((toast) => toast.mock.calls.length)).toEqual([0, 0, 0, 0]);
		expect(onclose).not.toHaveBeenCalled();
	});
});
