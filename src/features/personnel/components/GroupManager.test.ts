// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import type { ComponentProps } from 'svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Group } from '$features/personnel/contracts';
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

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
});

describe('GroupManager', () => {
	it('uses icon-only row actions with group-specific accessible labels', () => {
		renderGroupManager();

		expect(screen.getByRole('button', { name: 'Edit Alpha Company' })).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Remove Alpha Company' })).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Edit Bravo Company' })).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Remove Bravo Company' })).toBeTruthy();
	});

	it('saves a trimmed rename and confirms removal for the selected Group', async () => {
		const onRemove = vi.fn();
		const onRename = vi.fn();
		renderGroupManager({ onRemove, onRename });

		await fireEvent.click(screen.getByRole('button', { name: 'Edit Alpha Company' }));
		await fireEvent.input(screen.getByRole('textbox', { name: 'Group name' }), {
			target: { value: '  Updated Alpha  ' }
		});
		await fireEvent.click(screen.getByRole('button', { name: 'Save' }));
		expect(onRename).toHaveBeenCalledWith('group-alpha', 'Updated Alpha');

		await fireEvent.click(screen.getByRole('button', { name: 'Remove Bravo Company' }));

		expect(screen.getByRole('alertdialog', { name: 'Remove Group' })).toBeTruthy();

		await fireEvent.click(screen.getByRole('button', { name: 'Remove' }));

		expect(onRemove).toHaveBeenCalledWith('group-bravo');
	});

	it('serializes pending additions and associates a rejected addition with the keyboard draft', async () => {
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
		expect(input.getAttribute('aria-invalid')).toBe('true');
		expect(document.getElementById(input.getAttribute('aria-describedby') ?? '')?.textContent).toBe(
			'Organization is suspended'
		);
		expect(input.value).toBe('Pending Group');
		expect(input.readOnly).toBe(false);
		await fireEvent.keyDown(input, { key: 'Enter' });
		await waitFor(() => expect(input.value).toBe(''));
		expect(screen.queryByRole('alert')).toBeNull();
		expect(input.getAttribute('aria-invalid')).toBeNull();
		expect(onAdd).toHaveBeenCalledTimes(2);
	});

	it('blocks closing a draft without busy state, then holds focus only while the save is pending', async () => {
		let reject!: (reason: Error) => void;
		const onAdd = vi.fn(
			() =>
				new Promise<void>((_resolve, rejectPromise) => {
					reject = rejectPromise;
				})
		);
		const onClose = vi.fn();
		renderGroupManager({ onAdd, onClose });
		const dialog = screen.getByRole('dialog', { name: 'Manage Groups' });
		const input = screen.getByLabelText('Organization groups') as HTMLInputElement;

		await fireEvent.input(input, { target: { value: 'Alpha Company' } });
		expect(dialog.hasAttribute('aria-busy')).toBe(false);
		await fireEvent.keyDown(dialog, { key: 'Escape' });
		expect(screen.getByRole('dialog', { name: 'Manage Groups' })).toBe(dialog);

		const add = screen.getByRole('button', { name: 'Add' });
		add.focus();
		await fireEvent.click(add);
		expect(dialog.getAttribute('aria-busy')).toBe('true');
		expect(document.activeElement).toBe(dialog);

		reject(new Error('A group named Alpha Company already exists'));
		await waitFor(() => expect(dialog.hasAttribute('aria-busy')).toBe(false));
		expect(document.getElementById(input.getAttribute('aria-describedby') ?? '')?.textContent).toBe(
			'A group named Alpha Company already exists'
		);
		await fireEvent.keyDown(dialog, { key: 'Escape' });
		expect(screen.getByRole('dialog', { name: 'Manage Groups' })).toBe(dialog);
		expect(within(dialog).queryByRole('button', { name: 'Close' })).toBeNull();
		expect(input.value).toBe('Alpha Company');
		expect(onClose).not.toHaveBeenCalled();
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
