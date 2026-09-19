// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { groupsStore } from '$lib/stores/groups.svelte';
import { personnelStore } from '$features/personnel/stores/personnel.svelte';
import type { Personnel } from '$lib/types';
import type { PersonnelPageContext } from '$features/personnel/contexts/PersonnelPageContext.svelte';
import { ModalRegistry } from '$lib/utils/modalRegistry.svelte';
import PersonnelModals from './PersonnelModals.svelte';

vi.mock('$app/navigation', () => ({ invalidateAll: vi.fn() }));

afterEach(async () => {
	cleanup();
	await new Promise((resolve) => setTimeout(resolve, 30));
	vi.unstubAllGlobals();
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
			groupsStore.load([originalGroup], 'org-a');
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
