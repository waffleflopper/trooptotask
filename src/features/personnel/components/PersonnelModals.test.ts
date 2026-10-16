// @vitest-environment happy-dom
import { createClientAccess } from '$lib/access/clientAccess';
import { createCapabilityMap } from '$lib/access/memberAccessShape';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { tick } from 'svelte';
import { groupCatalogHydration, groupsStore } from '$features/personnel';
import { personnelStore } from '$features/personnel/stores/personnel.svelte';
import type { Personnel } from '../personnel.types';
import { PersonnelPageContext } from '$features/personnel/contexts/PersonnelPageContext.svelte';
import { toastStore } from '$lib/stores/toast.svelte';
import { ModalRegistry } from '$lib/utils/modalRegistry.svelte';
import PersonnelModals from './PersonnelModals.svelte';
import type { RequestPersonnelArchiveApproval } from '../utils/archivePersonnel';
import { settles } from '$lib/test-support/settles';

const requestArchiveApproval: RequestPersonnelArchiveApproval = async () => false;

vi.mock('$app/navigation', () => ({ goto: vi.fn(), invalidateAll: vi.fn() }));

afterEach(async () => {
	cleanup();
	await new Promise((resolve) => setTimeout(resolve, 30));
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe('Group mutation denial through Personnel modal consumers', () => {
	it.each(['add', 'rename', 'remove'] as const)(
		'preserves Group and Personnel state on denied %s and supports retry',
		async (operation) => {
			const originalGroup = { id: 'group-a', name: 'Alpha', sortOrder: 0 };
			const originalPerson = {
				id: 'person-a',
				groupId: 'group-a',
				groupName: 'Alpha',
				firstName: 'Synthetic',
				lastName: 'Person'
			} as Personnel;
			groupCatalogHydration.load([originalGroup], 'org-a');
			personnelStore.load([originalPerson], 'org-a');
			let denied = true;
			vi.stubGlobal(
				'fetch',
				vi.fn(async (_url, init) => {
					if (denied) return Response.json({ message: 'Organization is suspended' }, { status: 403 });
					if (operation === 'remove') return Response.json({ success: true });
					return Response.json({
						...originalGroup,
						...JSON.parse(init.body),
						id: operation === 'add' ? 'group-new' : 'group-a'
					});
				})
			);
			const modals = new ModalRegistry();
			modals.open('group-manager');
			render(PersonnelModals, { props: { ctx: {} as PersonnelPageContext, modals, requestArchiveApproval } });
			let submit: () => Promise<unknown>;
			if (operation === 'add') {
				await fireEvent.input(screen.getByLabelText('Organization groups'), { target: { value: 'New Group' } });
				submit = () => fireEvent.keyDown(screen.getByLabelText('Organization groups'), { key: 'Enter' });
			} else if (operation === 'rename') {
				await fireEvent.click(screen.getByRole('button', { name: 'Edit Alpha' }));
				await fireEvent.input(screen.getByDisplayValue('Alpha'), { target: { value: 'Renamed Group' } });
				submit = () => fireEvent.click(screen.getByRole('button', { name: 'Save' }));
			} else {
				await fireEvent.click(screen.getByRole('button', { name: 'Remove Alpha' }));
				submit = () => fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Remove' }));
			}
			await submit();
			await waitFor(() => expect(screen.getByRole('alert').textContent).toBeTruthy());
			expect(groupsStore.items).toEqual([originalGroup]);
			expect(personnelStore.getById('person-a')).toEqual(originalPerson);
			if (operation === 'add')
				expect((screen.getByLabelText('Organization groups') as HTMLInputElement).value).toBe('New Group');
			if (operation === 'rename') expect(screen.getByDisplayValue('Renamed Group')).toBeTruthy();
			if (operation === 'remove') expect(screen.getByRole('alertdialog', { name: 'Remove Group' })).toBeTruthy();
			if (operation === 'remove') {
				await waitFor(() =>
					expect(
						(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Remove' }) as HTMLButtonElement)
							.disabled
					).toBe(false)
				);
			}
			denied = false;
			await submit();
			await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
			await waitFor(() => {
				if (operation === 'add') expect(groupsStore.items.map((g) => g.name)).toEqual(['Alpha', 'New Group']);
				if (operation === 'rename') expect(personnelStore.getById('person-a')?.groupName).toBe('Renamed Group');
				if (operation === 'remove') expect(personnelStore.getById('person-a')?.groupId).toBeNull();
			});
		}
	);
});

describe('scoped Personnel creation', () => {
	it('requires an explicit permitted Group and retains the draft through a failed save', async () => {
		groupCatalogHydration.load(
			[
				{ id: 'alpha', name: 'Alpha', sortOrder: 0 },
				{ id: 'bravo', name: 'Bravo', sortOrder: 1 }
			],
			'org-a'
		);
		personnelStore.load([], 'org-a');
		const modals = new ModalRegistry();
		const ctx = new PersonnelPageContext(
			{
				orgId: 'org-a',
				orgName: 'A',
				pinnedGroups: [],
				rankCatalog: [
					{
						code: 'SPC',
						label: 'Specialist',
						service: 'army',
						category: 'enlisted',
						payGrade: 'E-4',
						state: 'active',
						sortOrder: 0
					}
				]
			},
			modals,
			createClientAccess({
				membershipRole: 'member',
				capabilityMap: { ...createCapabilityMap('none'), personnel: 'configure' },
				scopeSet: { kind: 'groups', groupIds: ['alpha'] }
			})
		);
		let fail = true;
		const requests: unknown[] = [];
		vi.stubGlobal(
			'fetch',
			vi.fn(async (_url, init) => {
				const draft = JSON.parse(init.body);
				requests.push(draft);
				return fail
					? Response.json({ message: 'Unavailable' }, { status: 503 })
					: Response.json({ ...draft, id: 'saved-alpha' });
			})
		);
		vi.spyOn(toastStore, 'error').mockReturnValue('synthetic-error');
		modals.open('personnel-modal', { person: null });
		render(PersonnelModals, { props: { ctx, modals, requestArchiveApproval } });
		await fireEvent.input(screen.getByLabelText('Last Name'), { target: { value: 'Scoped' } });
		await fireEvent.input(screen.getByLabelText('First Name'), { target: { value: 'Synthetic' } });
		await fireEvent.click(screen.getByTestId('personnel-save'));
		expect(requests).toEqual([]);
		expect(screen.getByRole('button', { name: 'Group' }).getAttribute('aria-invalid')).toBe('true');
		await fireEvent.click(screen.getByRole('button', { name: 'Group' }));
		expect(screen.queryByRole('option', { name: 'Bravo' })).toBeNull();
		expect(screen.queryByRole('option', { name: 'No Group Assigned' })).toBeNull();
		await fireEvent.click(await screen.findByRole('option', { name: 'Alpha' }));
		expect(screen.queryByRole('button', { name: 'Clear selection' })).toBeNull();
		await fireEvent.click(screen.getByTestId('personnel-save'));
		await waitFor(() => expect(toastStore.error).toHaveBeenCalled());
		expect(personnelStore.items).toEqual([]);
		expect(modals.isOpen('personnel-modal')).toBe(true);
		expect((screen.getByLabelText('Last Name') as HTMLInputElement).value).toBe('Scoped');
		expect(screen.getByRole('button', { name: 'Group' }).textContent).toContain('Alpha');
		fail = false;
		await fireEvent.click(screen.getByTestId('personnel-save'));
		await waitFor(() => expect(modals.isOpen('personnel-modal')).toBe(false));
		expect(requests).toEqual([
			expect.objectContaining({ groupId: 'alpha' }),
			expect.objectContaining({ groupId: 'alpha' })
		]);
		expect(personnelStore.items).toEqual([
			expect.objectContaining({ id: 'saved-alpha', groupId: 'alpha', lastName: 'Scoped' })
		]);
	});
});

describe('retired Personnel save feedback', () => {
	it.each([200, 503])('keeps the destination quiet when a retired save returns HTTP %s', async (status) => {
		const personA: Personnel = {
			id: 'person-a',
			slug: 'synthetic-alpha',
			rank: 'SPC',
			firstName: 'Synthetic',
			lastName: 'Alpha',
			mos: '68V',
			clinicRole: 'Medic',
			ets: null,
			deros: null,
			groupId: null,
			groupName: '',
			archivedAt: null
		};
		const personB: Personnel = { ...personA, id: 'person-b', slug: 'synthetic-bravo', lastName: 'Bravo' };
		const expectedB = structuredClone([personB]);
		const access = (level: 'configure' | 'view') =>
			createClientAccess({
				membershipRole: 'member',
				capabilityMap: { ...createCapabilityMap('none'), personnel: level },
				scopeSet: { kind: 'organization' }
			});
		const rankCatalog = [
			{
				code: 'SPC',
				label: 'Specialist',
				service: 'army' as const,
				category: 'enlisted' as const,
				payGrade: 'E-4' as const,
				state: 'active' as const,
				sortOrder: 0
			}
		];
		groupCatalogHydration.load([], 'org-a');
		personnelStore.load([personA], 'org-a');
		let releaseResponse!: (response: Response) => void;
		const response = new Promise<Response>((resolve) => {
			releaseResponse = resolve;
		});
		let submitted: unknown;
		vi.stubGlobal('fetch', (url: string, init: RequestInit) => {
			if (url !== '/org/org-a/api/personnel' || init.method !== 'PUT') throw new Error('Unexpected request');
			submitted = JSON.parse(init.body as string);
			return response;
		});
		let updateSettled: Promise<boolean> | undefined;
		const update = personnelStore.updateOrThrow;
		vi.spyOn(personnelStore, 'updateOrThrow').mockImplementation((id, data) => {
			updateSettled = update(id, data);
			return updateSettled;
		});
		const error = vi.spyOn(toastStore, 'error').mockReturnValue('synthetic-error');
		const success = vi.spyOn(toastStore, 'success').mockReturnValue('synthetic-success');
		const modalsA = new ModalRegistry();
		const ctxA = new PersonnelPageContext(
			{ orgId: 'org-a', orgName: 'A', pinnedGroups: [], rankCatalog },
			modalsA,
			access('configure'),
			personnelStore
		);
		modalsA.open('personnel-modal', { person: personA });
		const ownerA = render(PersonnelModals, { props: { ctx: ctxA, modals: modalsA, requestArchiveApproval } });
		await fireEvent.input(screen.getByLabelText('Duty Role'), { target: { value: 'Held Save First' } });
		await fireEvent.click(screen.getByTestId('personnel-save'));
		expect(submitted).toEqual(expect.objectContaining({ id: 'person-a', clinicRole: 'Held Save First' }));
		expect(screen.getByRole('button', { name: 'Saving...' })).toBeTruthy();
		if (!updateSettled) throw new Error('Personnel save did not dispatch');

		ownerA.unmount();
		groupCatalogHydration.load([], 'org-b');
		personnelStore.load([personB], 'org-b');
		const modalsB = new ModalRegistry();
		const ctxB = new PersonnelPageContext(
			{ orgId: 'org-b', orgName: 'B', pinnedGroups: [], rankCatalog },
			modalsB,
			access('view'),
			personnelStore
		);
		render(PersonnelModals, { props: { ctx: ctxB, modals: modalsB, requestArchiveApproval } });
		expect(personnelStore.items).toEqual(expectedB);
		releaseResponse(
			status === 200
				? Response.json({ ...personA, clinicRole: 'Held Save First' })
				: Response.json({ message: 'Unavailable' }, { status })
		);
		expect(await settles(updateSettled)).toBe(false);
		await tick();
		await new Promise((resolve) => setTimeout(resolve, 0));

		expect(personnelStore.orgId).toBe('org-b');
		expect(personnelStore.items).toEqual(expectedB);
		expect(error).not.toHaveBeenCalled();
		expect(success).not.toHaveBeenCalled();
		expect(modalsB.isOpen('personnel-modal')).toBe(false);
	});
});

describe('rejected Personnel and Group save feedback', () => {
	const rankCatalog = [
		{
			code: 'SPC',
			label: 'Specialist',
			service: 'army' as const,
			category: 'enlisted' as const,
			payGrade: 'E-4' as const,
			state: 'active' as const,
			sortOrder: 0
		}
	];
	const person: Personnel = {
		id: 'person-a',
		slug: 'synthetic-alpha',
		rank: 'SPC',
		firstName: 'Synthetic',
		lastName: 'Alpha',
		mos: '68V',
		clinicRole: 'Medic',
		ets: null,
		deros: null,
		groupId: null,
		groupName: '',
		archivedAt: null
	};

	it.each([
		[404, 'This person is no longer available.', 'This person is no longer available.'],
		[500, 'Internal server error', 'Failed to update personnel']
	])('keeps a Personnel edit open and shows the reason for a %i', async (status, serverMessage, shown) => {
		groupCatalogHydration.load([], 'org-a');
		personnelStore.load([person], 'org-a');
		vi.stubGlobal('fetch', async () => Response.json({ message: serverMessage }, { status }));
		const error = vi.spyOn(toastStore, 'error').mockReturnValue('synthetic-error');
		const modals = new ModalRegistry();
		const ctx = new PersonnelPageContext(
			{ orgId: 'org-a', orgName: 'A', pinnedGroups: [], rankCatalog },
			modals,
			createClientAccess({
				membershipRole: 'member',
				capabilityMap: { ...createCapabilityMap('none'), personnel: 'configure' },
				scopeSet: { kind: 'organization' }
			}),
			personnelStore
		);
		modals.open('personnel-modal', { person });
		render(PersonnelModals, { props: { ctx, modals, requestArchiveApproval } });

		await fireEvent.input(screen.getByLabelText('Duty Role'), { target: { value: 'Platoon Medic' } });
		await fireEvent.click(screen.getByTestId('personnel-save'));

		await waitFor(() => expect(error).toHaveBeenCalledWith(shown));
		expect(modals.isOpen('personnel-modal')).toBe(true);
		expect((screen.getByLabelText('Duty Role') as HTMLInputElement).value).toBe('Platoon Medic');
		expect(personnelStore.items).toEqual([person]);
	});

	it.each([
		['a name another Group already has', 'bravo', null, 'A Group with that name already exists.'],
		['a server conflict', 'Charlie', 409, 'A Group with that name already exists.'],
		['a server failure', 'Charlie', 500, 'Unable to rename Group. Try again.']
	] as const)('keeps a Group rename open and explains %s', async (_case, name, status, shown) => {
		const groups = [
			{ id: 'group-a', name: 'Alpha', sortOrder: 0 },
			{ id: 'group-b', name: 'Bravo', sortOrder: 1 }
		];
		groupCatalogHydration.load(groups, 'org-a');
		personnelStore.load([], 'org-a');
		const requests: string[] = [];
		vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
			requests.push(JSON.parse(init.body as string).name);
			return Response.json(
				{ message: status === 409 ? 'A Group with that name already exists.' : 'Internal server error' },
				{ status: status ?? 500 }
			);
		});
		const modals = new ModalRegistry();
		modals.open('group-manager');
		render(PersonnelModals, { props: { ctx: {} as PersonnelPageContext, modals, requestArchiveApproval } });

		await fireEvent.click(screen.getByRole('button', { name: 'Edit Alpha' }));
		await fireEvent.input(screen.getByDisplayValue('Alpha'), { target: { value: name } });
		await fireEvent.click(screen.getByRole('button', { name: 'Save' }));

		await waitFor(() => expect(screen.getByRole('alert').textContent?.trim()).toBe(shown));
		expect(screen.getByDisplayValue(name)).toBeTruthy();
		expect(groupsStore.items).toEqual(groups);
		expect(requests).toEqual(status ? [name] : []);
	});
});
