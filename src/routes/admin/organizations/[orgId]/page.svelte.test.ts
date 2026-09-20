// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/svelte';

vi.mock('$app/navigation', () => ({ invalidateAll: vi.fn() }));
import Page from './+page.svelte';

afterEach(cleanup);

function renderDetail(isSuspended = false) {
	return render(Page, {
		props: {
			data: {
				org: {
					id: 'org-1',
					name: 'Alpha Company',
					suspendedAt: isSuspended ? '2026-05-01T00:00:00Z' : null,
					createdAt: '2026-04-01T00:00:00Z',
					isSuspended
				},
				adminRole: 'super_admin',
				personnelCount: 12,
				auditEvents: [],
				members: [
					{ userId: 'owner-1', email: 'owner@example.test', role: 'owner' },
					{ userId: 'member-1', email: 'member@example.test', role: 'member' }
				]
			} as never
		}
	});
}

describe('admin organization detail', () => {
	it('opens ownership transfer with eligible members and requires name confirmation', async () => {
		renderDetail();
		expect(screen.getByRole('link', { name: 'member@example.test' }).getAttribute('href')).toBe(
			'/admin/users/member-1'
		);
		await fireEvent.click(screen.getByRole('button', { name: 'Transfer Ownership' }));
		const dialog = within(screen.getByRole('dialog'));
		expect(dialog.queryByRole('option', { name: /owner@example.test/ })).toBeNull();
		const confirm = dialog.getByRole('button', { name: 'Transfer Ownership' });
		expect(confirm).toBeDisabled();
		await fireEvent.change(dialog.getByRole('combobox', { name: 'New Owner' }), { target: { value: 'member-1' } });
		expect(confirm).toBeDisabled();
		await fireEvent.input(dialog.getByRole('textbox', { name: /Type Alpha Company/ }), {
			target: { value: 'Alpha Company' }
		});
		expect(confirm).toBeEnabled();
		await fireEvent.click(dialog.getByRole('button', { name: 'Cancel' }));
		expect(screen.queryByRole('dialog')).toBeNull();
	});

	it.each([false, true])('opens the retained suspension action for suspended=%s', async (suspended) => {
		renderDetail(suspended);
		const action = suspended ? 'Unsuspend' : 'Suspend';
		await fireEvent.click(screen.getByRole('button', { name: action }));
		const dialog = within(screen.getByRole('dialog'));
		expect(dialog.getByRole('button', { name: action })).toBeEnabled();
		await fireEvent.click(dialog.getByRole('button', { name: 'Cancel' }));
		expect(screen.queryByRole('dialog')).toBeNull();
	});
});
