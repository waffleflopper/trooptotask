// @vitest-environment happy-dom
import { createClientAccess } from '$lib/access/clientAccess';
import { createCapabilityMap } from '$lib/access/memberAccessShape';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { tick } from 'svelte';
import { groupCatalogHydration, groupsStore, pinnedGroupsHydration, pinnedGroupsStore } from '$features/personnel';
import { personnelStore } from '$features/personnel/stores/personnel.svelte';
import type { Personnel } from '../personnel.types';
import { PersonnelPageContext } from '$features/personnel/contexts/PersonnelPageContext.svelte';
import { toastStore } from '$lib/stores/toast.svelte';
import { endOrganizationLifetime } from '$lib/stores/core';
import { ModalRegistry } from '$lib/utils/modalRegistry.svelte';
import PersonnelModals from './PersonnelModals.svelte';
import { RosterPeek } from '../rosterPeek.svelte';
import type { RosterPeekSection } from '../rosterPeek';
import * as groupMembership from '../utils/moveGroupMembers';

vi.mock('$app/navigation', () => ({ goto: vi.fn(), invalidate: vi.fn() }));

afterEach(async () => {
	cleanup();
	await new Promise((resolve) => setTimeout(resolve, 30));
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

function groupEditorContext(modals: ModalRegistry, peek?: RosterPeek) {
	return new PersonnelPageContext(
		{ orgId: 'org-a', asOf: '2026-10-23', orgName: 'A', pinnedGroups: [] },
		modals,
		createClientAccess({
			membershipRole: 'member',
			capabilityMap: { ...createCapabilityMap('none'), personnel: 'configure' },
			scopeSet: { kind: 'organization' }
		}),
		personnelStore,
		[],
		undefined,
		null,
		peek
	);
}

describe('Group mutation denial through Personnel modal consumers', () => {
	it.each(['add', 'rename', 'delete'] as const)(
		'preserves Group and Personnel state on denied %s and supports retry',
		async (operation) => {
			const originalGroup = { id: 'group-a', name: 'Alpha', sortOrder: 0 };
			const originalPerson = {
				id: 'person-a',
				slug: 'synthetic-person',
				rank: 'SPC',
				groupId: 'group-a',
				groupName: 'Alpha',
				firstName: 'Synthetic',
				lastName: 'Person',
				mos: '68W',
				clinicRole: 'Medic',
				ets: null,
				deros: null,
				archivedAt: null
			} as Personnel;
			groupCatalogHydration.load([originalGroup], 'org-a');
			personnelStore.load([originalPerson], 'org-a');
			let denied = true;
			vi.stubGlobal(
				'fetch',
				vi.fn(async (_url, init) => {
					if (denied) return Response.json({ message: 'Organization is suspended' }, { status: 403 });
					if (operation === 'delete') return Response.json({ movedCount: 1 });
					return Response.json({
						...originalGroup,
						...JSON.parse(init.body),
						id: operation === 'add' ? 'group-new' : 'group-a'
					});
				})
			);
			const modals = new ModalRegistry();
			modals.open('group-manager');
			render(PersonnelModals, { props: { ctx: groupEditorContext(modals), modals } });
			let submit: () => Promise<unknown>;
			if (operation === 'add') {
				await fireEvent.input(screen.getByLabelText('New group name'), { target: { value: 'New Group' } });
				submit = () => fireEvent.keyDown(screen.getByLabelText('New group name'), { key: 'Enter' });
			} else if (operation === 'rename') {
				await fireEvent.click(screen.getByRole('button', { name: 'Rename Alpha' }));
				await fireEvent.input(screen.getByDisplayValue('Alpha'), { target: { value: 'Renamed Group' } });
				submit = () => fireEvent.click(screen.getByRole('button', { name: 'Save' }));
			} else {
				await fireEvent.click(screen.getByRole('button', { name: 'Delete Alpha…' }));
				submit = () => fireEvent.click(screen.getByRole('button', { name: 'Delete and move 1' }));
			}
			await submit();
			await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('Organization is suspended'));
			expect(groupsStore.items).toEqual([originalGroup]);
			expect(personnelStore.getById('person-a')).toEqual(originalPerson);
			if (operation === 'add')
				expect((screen.getByLabelText('New group name') as HTMLInputElement).value).toBe('New Group');
			if (operation === 'rename') expect(screen.getByDisplayValue('Renamed Group')).toBeTruthy();
			if (operation === 'delete') expect(screen.getByRole('group', { name: 'Delete Alpha' })).toBeTruthy();
			await waitFor(() =>
				expect(
					(
						screen.getByRole('button', {
							name: operation === 'add' ? 'Add' : operation === 'rename' ? 'Save' : 'Delete and move 1'
						}) as HTMLButtonElement
					).disabled
				).toBe(false)
			);
			denied = false;
			await submit();
			await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
			await waitFor(() => {
				if (operation === 'add') expect(groupsStore.items.map((g) => g.name)).toEqual(['Alpha', 'New Group']);
				if (operation === 'rename') expect(personnelStore.getById('person-a')?.groupName).toBe('Renamed Group');
				if (operation === 'delete')
					expect(personnelStore.getById('person-a')).toMatchObject({ groupId: null, groupName: '' });
			});
		}
	);
});

describe('Group editor changes reach the roster in place', () => {
	it('ignores a membership reply from a retired visit after returning to the same Organization', async () => {
		const person: Personnel = {
			id: 'person-a',
			rank: 'SPC',
			firstName: 'Synthetic',
			lastName: 'Person',
			mos: '68W',
			clinicRole: 'Medic',
			groupId: 'group-a',
			groupName: 'Alpha',
			archivedAt: null
		};
		const groups = [
			{ id: 'group-a', name: 'Alpha', sortOrder: 0 },
			{ id: 'group-b', name: 'Bravo', sortOrder: 1 }
		];
		groupCatalogHydration.load(groups, 'org-a');
		personnelStore.load([person], 'org-a');
		const reply = Promise.withResolvers<Response>();
		const dispatched = Promise.withResolvers<void>();
		let membershipReply: Promise<groupMembership.GroupMembershipChange> | undefined;
		const move = groupMembership.moveGroupMembers;
		vi.spyOn(groupMembership, 'moveGroupMembers').mockImplementation((...args) => {
			membershipReply = move(...args);
			return membershipReply;
		});
		vi.stubGlobal(
			'fetch',
			vi.fn(() => {
				dispatched.resolve();
				return reply.promise;
			})
		);
		const oldModals = new ModalRegistry();
		oldModals.open('group-manager');
		const oldVisit = render(PersonnelModals, {
			props: { ctx: groupEditorContext(oldModals), modals: oldModals }
		});
		await fireEvent.click(screen.getByRole('checkbox', { name: 'Select SPC Person, Synthetic' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Remove from Group' }));
		await dispatched.promise;

		oldVisit.unmount();
		endOrganizationLifetime();
		personnelStore.load([], 'org-b');
		groupCatalogHydration.load(groups, 'org-a');
		personnelStore.load([{ ...person, groupId: 'group-b', groupName: 'Bravo' }], 'org-a');
		const currentModals = new ModalRegistry();
		currentModals.open('group-manager', { select: 'group-b' });
		render(PersonnelModals, {
			props: { ctx: groupEditorContext(currentModals), modals: currentModals }
		});
		reply.resolve(Response.json({ groupId: null, movedIds: ['person-a'], unavailableIds: [] }));
		await membershipReply;
		await tick();

		expect(personnelStore.getById('person-a')).toMatchObject({ groupId: 'group-b', groupName: 'Bravo' });
		expect(screen.getByRole('list', { name: 'Members of Bravo' }).textContent).toContain('Person, Synthetic');
	});

	it('opens Unassigned through the context entry point with null', () => {
		groupCatalogHydration.load([{ id: 'group-a', name: 'Alpha', sortOrder: 0 }], 'org-a');
		personnelStore.load(
			[
				{
					id: 'person-unassigned',
					rank: 'SPC',
					firstName: 'Synthetic',
					lastName: 'Unassigned',
					mos: '',
					clinicRole: '',
					groupId: null,
					groupName: '',
					archivedAt: null
				}
			],
			'org-a'
		);
		const modals = new ModalRegistry();
		const ctx = groupEditorContext(modals);
		ctx.openGroupEditor(null);
		render(PersonnelModals, { props: { ctx, modals } });
		expect(screen.getByRole('list', { name: 'Members of Unassigned' })).toBeTruthy();
		expect(screen.queryByRole('button', { name: 'Rename Alpha' })).toBeNull();
	});

	it("carries the viewer's pin through a rename and moves a removed member to Unassigned on the roster", async () => {
		const person = {
			id: 'person-a',
			slug: 'synthetic-person',
			rank: 'SPC',
			groupId: 'group-a',
			groupName: 'Alpha',
			firstName: 'Synthetic',
			lastName: 'Person',
			mos: '68W',
			clinicRole: 'Medic',
			ets: null,
			deros: null,
			archivedAt: null
		} as Personnel;
		groupCatalogHydration.load([{ id: 'group-a', name: 'Alpha', sortOrder: 0 }], 'org-a');
		personnelStore.load([person], 'org-a');
		pinnedGroupsHydration.load(['Alpha'], 'org-a');
		const requests: string[] = [];
		vi.stubGlobal(
			'fetch',
			vi.fn(async (url: string, init: RequestInit) => {
				requests.push(`${init.method} ${url}`);
				if (url.endsWith('/group-membership'))
					return Response.json({ groupId: null, movedIds: ['person-a'], unavailableIds: [] });
				return Response.json({ id: 'group-a', name: 'Weapons', sortOrder: 0 });
			})
		);
		const modals = new ModalRegistry();
		modals.open('group-manager');
		render(PersonnelModals, { props: { ctx: groupEditorContext(modals), modals } });

		await fireEvent.click(screen.getByRole('button', { name: 'Rename Alpha' }));
		await fireEvent.input(screen.getByDisplayValue('Alpha'), { target: { value: 'Weapons' } });
		await fireEvent.click(screen.getByRole('button', { name: 'Save' }));
		await waitFor(() => expect(pinnedGroupsStore.list).toEqual(['Weapons']));
		expect(personnelStore.getById('person-a')?.groupName).toBe('Weapons');

		await fireEvent.click(screen.getByRole('checkbox', { name: 'Select SPC Person, Synthetic' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Remove from Group' }));
		await waitFor(() => expect(personnelStore.getById('person-a')).toMatchObject({ groupId: null, groupName: '' }));
		expect(requests).toEqual(['PUT /org/org-a/api/groups', 'POST /org/org-a/api/personnel/group-membership']);
	});

	describe('for a Person whose preview is open', () => {
		const member = {
			id: 'person-a',
			slug: 'synthetic-person',
			rank: 'SPC',
			groupId: 'group-a',
			groupName: 'Alpha',
			firstName: 'Synthetic',
			lastName: 'Person',
			mos: '68W',
			clinicRole: 'Medic',
			ets: null,
			deros: null,
			archivedAt: null
		} as Personnel;

		function openPreview() {
			groupCatalogHydration.load(
				[
					{ id: 'group-a', name: 'Alpha', sortOrder: 0 },
					{ id: 'group-b', name: 'Bravo', sortOrder: 1 }
				],
				'org-a'
			);
			personnelStore.load([member], 'org-a');
			const reads: RosterPeekSection[] = [];
			const peek = new RosterPeek('org-a', {
				readSection: async (_orgId, _personnelId, section) => {
					reads.push(section);
					return { state: 'hidden' };
				}
			});
			peek.show('person-a');
			const modals = new ModalRegistry();
			modals.open('group-manager', { select: 'group-a' });
			render(PersonnelModals, { props: { ctx: groupEditorContext(modals, peek), modals } });
			return reads;
		}

		it("rereads the Person's Calendar and Needs attention when the editor moves them out of their Group", async () => {
			const reads = openPreview();
			await waitFor(() => expect(reads).toHaveLength(5));
			vi.stubGlobal(
				'fetch',
				vi.fn(async () => Response.json({ groupId: null, movedIds: ['person-a'], unavailableIds: [] }))
			);

			await fireEvent.click(screen.getByRole('checkbox', { name: 'Select SPC Person, Synthetic' }));
			await fireEvent.click(screen.getByRole('button', { name: 'Remove from Group' }));

			await waitFor(() => expect(reads.slice(5).toSorted()).toEqual(['attention', 'next7']));
		});

		it("rereads the Person's Calendar and Needs attention when deleting their Group moves them to another", async () => {
			const reads = openPreview();
			await waitFor(() => expect(reads).toHaveLength(5));
			vi.stubGlobal(
				'fetch',
				vi.fn(async () => Response.json({ movedCount: 1 }))
			);

			await fireEvent.click(screen.getByRole('button', { name: 'Delete Alpha…' }));
			await fireEvent.click(screen.getByRole('button', { name: 'Delete and move 1' }));

			await waitFor(() => expect(personnelStore.getById('person-a')?.groupId).toBe('group-b'));
			expect(reads.slice(5).toSorted()).toEqual(['attention', 'next7']);
		});
	});
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
				asOf: '2026-10-23',
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
		modals.open('personnel-modal');
		render(PersonnelModals, { props: { ctx, modals } });
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

describe('rejected Group rename feedback', () => {
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
		render(PersonnelModals, { props: { ctx: groupEditorContext(modals), modals } });

		await fireEvent.click(screen.getByRole('button', { name: 'Rename Alpha' }));
		await fireEvent.input(screen.getByDisplayValue('Alpha'), { target: { value: name } });
		await fireEvent.click(screen.getByRole('button', { name: 'Save' }));

		await waitFor(() => expect(screen.getByRole('alert').textContent?.trim()).toBe(shown));
		expect(screen.getByDisplayValue(name)).toBeTruthy();
		expect(groupsStore.items).toEqual(groups);
		expect(requests).toEqual(status ? [name] : []);
	});
});
