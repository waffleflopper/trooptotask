// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { groupCatalogHydration, groupsStore } from '$features/personnel';
import { personnelStore } from '$features/personnel/stores/personnel.svelte';
import type { Personnel } from '../personnel.types';
import { PersonnelPageContext } from '$features/personnel/contexts/PersonnelPageContext.svelte';
import { createTestOrgContext, NONE_TEST_CAPABILITY_MAP } from '$lib/test-support/orgContextBuilder';
import { toastStore } from '$lib/stores/toast.svelte';
import { ModalRegistry } from '$lib/utils/modalRegistry.svelte';
import PersonnelModals from './PersonnelModals.svelte';

vi.mock('$app/navigation', () => ({ invalidateAll: vi.fn() }));

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
			render(PersonnelModals, { props: { ctx: {} as PersonnelPageContext, modals } });
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
			createTestOrgContext({
				orgId: 'org-a',
				userRole: 'member',
				capabilityMap: { ...NONE_TEST_CAPABILITY_MAP, personnel: 'configure' },
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

describe('Personnel Edit archive recovery', () => {
	const originalPerson: Personnel = {
		id: 'person-archive',
		rank: 'SPC',
		firstName: 'Synthetic',
		lastName: 'Recovery',
		mos: '68W',
		clinicRole: 'Medic',
		groupId: 'alpha',
		groupName: 'Alpha'
	};

	function openEditor() {
		groupCatalogHydration.load([{ id: 'alpha', name: 'Alpha', sortOrder: 0 }], 'org-a');
		personnelStore.load([structuredClone(originalPerson)], 'org-a');
		const modals = new ModalRegistry();
		const ctx = new PersonnelPageContext(
			{ orgId: 'org-a', orgName: 'A', pinnedGroups: [], rankCatalog: [] },
			modals,
			createTestOrgContext({
				orgId: 'org-a',
				userRole: 'member',
				capabilityMap: { ...NONE_TEST_CAPABILITY_MAP, personnel: 'operate' }
			})
		);
		modals.open('personnel-modal', { person: structuredClone(originalPerson) });
		render(PersonnelModals, { props: { ctx, modals } });
		return modals;
	}

	async function archive() {
		await fireEvent.click(screen.getByTestId('personnel-archive'));
		await fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Archive' }));
	}

	it.each(['direct', 'approval'] as const)(
		'retains the draft after failed %s archive and supports retry',
		async (mode) => {
			let failed = true;
			const writes: { url: string; method: string; body: unknown }[] = [];
			vi.stubGlobal(
				'fetch',
				vi.fn(async (url, init) => {
					writes.push({ url: String(url), method: init.method, body: JSON.parse(init.body) });
					if (String(url).endsWith('/deletion-requests')) {
						return failed ? Response.json({}, { status: 503 }) : Response.json({}, { status: 201 });
					}
					if (mode === 'approval') return Response.json({ requiresApproval: true }, { status: 202 });
					return failed ? Response.json({}, { status: 503 }) : Response.json({});
				})
			);
			vi.spyOn(toastStore, 'error').mockReturnValue('error');
			const success = vi.spyOn(toastStore, 'success').mockReturnValue('success');
			const modals = openEditor();
			await fireEvent.input(screen.getByLabelText('Duty Role'), { target: { value: 'Unsaved recovery duty' } });
			await archive();
			await waitFor(() => expect(toastStore.error).toHaveBeenCalled());
			expect(modals.isOpen('personnel-modal')).toBe(true);
			expect((screen.getByLabelText('Duty Role') as HTMLInputElement).value).toBe('Unsaved recovery duty');
			expect(personnelStore.items).toEqual([originalPerson]);
			expect(success).not.toHaveBeenCalled();
			// A failed confirmation may remain open; dismiss it before retrying the same draft.
			const confirmation = screen.queryByRole('alertdialog');
			if (confirmation) await fireEvent.click(within(confirmation).getByRole('button', { name: 'Cancel' }));
			failed = false;
			await archive();
			await waitFor(() => expect(modals.isOpen('personnel-modal')).toBe(false));
			expect(personnelStore.items).toEqual(mode === 'approval' ? [originalPerson] : []);
			expect(writes.filter((w) => w.url.endsWith('/personnel'))).toEqual([
				{ url: '/org/org-a/api/personnel', method: 'DELETE', body: { id: originalPerson.id } },
				{ url: '/org/org-a/api/personnel', method: 'DELETE', body: { id: originalPerson.id } }
			]);
			expect(writes.every((w) => w.method === 'DELETE' || w.method === 'POST')).toBe(true);
		}
	);

	it('acknowledges an already-pending approval without removing the active Person', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async (url) =>
				String(url).endsWith('/deletion-requests')
					? Response.json({}, { status: 409 })
					: Response.json({ requiresApproval: true }, { status: 202 })
			)
		);
		const error = vi.spyOn(toastStore, 'error').mockReturnValue('error');
		const modals = openEditor();
		await fireEvent.input(screen.getByLabelText('Duty Role'), { target: { value: 'Unrelated unsaved duty' } });
		await archive();
		await waitFor(() => expect(modals.isOpen('personnel-modal')).toBe(false));
		expect(personnelStore.items).toEqual([originalPerson]);
		expect(error).not.toHaveBeenCalled();
	});

	it('blocks saving or closing the editor while archive is pending, then retains its draft on failure', async () => {
		let respond!: (response: Response) => void;
		const response = new Promise<Response>((resolve) => {
			respond = resolve;
		});
		const fetch = vi.fn(() => response);
		vi.stubGlobal('fetch', fetch);
		vi.spyOn(toastStore, 'error').mockReturnValue('error');
		const modals = openEditor();
		await fireEvent.input(screen.getByLabelText('Duty Role'), { target: { value: 'Held archive duty' } });
		await archive();
		await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
		const editor = screen.getByRole('dialog', { name: 'Edit Personnel' });
		expect((within(editor).getByRole('button', { name: 'Save Changes' }) as HTMLButtonElement).disabled).toBe(true);
		expect((within(editor).getByRole('button', { name: 'Cancel' }) as HTMLButtonElement).disabled).toBe(true);
		await fireEvent.keyDown(document, { key: 'Escape' });
		expect(modals.isOpen('personnel-modal')).toBe(true);
		respond(Response.json({}, { status: 503 }));
		await waitFor(() => expect(toastStore.error).toHaveBeenCalled());
		expect(modals.isOpen('personnel-modal')).toBe(true);
		expect((screen.getByLabelText('Duty Role') as HTMLInputElement).value).toBe('Held archive duty');
		expect((screen.getByRole('button', { name: 'Save Changes' }) as HTMLButtonElement).disabled).toBe(false);
		expect(personnelStore.items).toEqual([originalPerson]);
	});
});
