// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import type { ComponentProps } from 'svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Group } from '$lib/stores/groups.svelte';
import GroupManager from './GroupManager.svelte';

const groups: Group[] = [
	{ id: 'group-alpha', name: 'Alpha Company', sortOrder: 0 },
	{ id: 'group-bravo', name: 'Bravo Company', sortOrder: 1 }
];

function renderGroupManager(overrides: Partial<ComponentProps<typeof GroupManager>> = {}) {
	return render(GroupManager, {
		props: {
			groups,
			onAdd: vi.fn(),
			onRemove: vi.fn(),
			onRename: vi.fn(),
			onClose: vi.fn(),
			...overrides
		}
	});
}

afterEach(async () => {
	cleanup();
	await new Promise((resolve) => setTimeout(resolve, 30));
	vi.restoreAllMocks();
});

describe('GroupManager', () => {
	it('uses icon-only row actions with group-specific accessible labels', () => {
		renderGroupManager();

		const editAlpha = screen.getByRole('button', { name: 'Edit Alpha Company' });
		const removeAlpha = screen.getByRole('button', { name: 'Remove Alpha Company' });

		expect(editAlpha.getAttribute('title')).toBe('Edit Alpha Company');
		expect(removeAlpha.getAttribute('title')).toBe('Remove Alpha Company');
		expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();
		expect(screen.queryByRole('button', { name: 'Remove' })).toBeNull();
		expect(screen.queryByText('Edit')).toBeNull();
		expect(screen.queryByText('Remove')).toBeNull();
	});

	it('keeps editing and removal flows wired to the icon actions', async () => {
		const onRemove = vi.fn();
		const onRename = vi.fn();
		renderGroupManager({ onRemove, onRename });

		await fireEvent.click(screen.getByRole('button', { name: 'Edit Alpha Company' }));

		expect(screen.getByDisplayValue('Alpha Company')).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Save' })).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Cancel' })).toBeTruthy();

		await fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Remove Bravo Company' }));

		expect(screen.getByRole('alertdialog', { name: 'Remove Group' })).toBeTruthy();
		expect(screen.getByText('Remove "Bravo Company"? Personnel in this group will become unassigned.')).toBeTruthy();

		await fireEvent.click(screen.getByRole('button', { name: 'Remove' }));

		expect(onRemove).toHaveBeenCalledWith('group-bravo');
		expect(onRename).not.toHaveBeenCalled();
	});

	it('serializes pending additions and retains the keyboard draft after rejection', async () => {
		let reject!: (reason: Error) => void;
		const onAdd = vi
			.fn()
			.mockImplementationOnce(
				() =>
					new Promise<void>((_resolve, rejectPromise) => {
						reject = rejectPromise;
					})
			)
			.mockResolvedValue(undefined);
		renderGroupManager({ onAdd });
		const input = screen.getByLabelText('Organization groups') as HTMLInputElement;
		await fireEvent.input(input, { target: { value: 'Pending Group' } });
		await fireEvent.keyDown(input, { key: 'Enter' });
		await fireEvent.keyDown(input, { key: 'Enter' });
		expect(onAdd).toHaveBeenCalledTimes(1);
		expect(input.readOnly).toBe(true);
		expect((screen.getByRole('button', { name: 'Done' }) as HTMLButtonElement).disabled).toBe(true);
		reject(new Error('Organization is suspended'));
		await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Organization is suspended'));
		expect(input.value).toBe('Pending Group');
		expect(input.readOnly).toBe(false);
		await fireEvent.keyDown(input, { key: 'Enter' });
		await waitFor(() => expect(input.value).toBe(''));
		expect(screen.queryByRole('alert')).toBeNull();
		expect(onAdd).toHaveBeenCalledTimes(2);
	});

	it('blocks accidental close affordances while group edits are in progress', async () => {
		const onClose = vi.fn();
		renderGroupManager({ onClose });

		const dialog = screen.getByRole('dialog', { name: 'Manage Groups' });
		expect(within(dialog).getByRole('button', { name: 'Close' })).toBeTruthy();

		await fireEvent.input(screen.getByLabelText('Organization groups'), { target: { value: 'Charlie Company' } });

		expect(within(dialog).queryByRole('button', { name: 'Close' })).toBeNull();

		await fireEvent.click(screen.getByRole('button', { name: 'Done' }));

		expect(onClose).toHaveBeenCalledTimes(1);
	});
});
