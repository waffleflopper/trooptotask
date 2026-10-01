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
import type { RequestPersonnelArchiveApproval } from '../utils/archivePersonnel';

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
