// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/svelte';
import type { ComponentProps } from 'svelte';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import Page from './+page.svelte';

vi.mock('$app/forms', () => ({ enhance: () => {} }));

beforeEach(() => vi.useFakeTimers());
afterEach(async () => {
	cleanup();
	await vi.runAllTimersAsync();
	vi.useRealTimers();
});

it('shows a deletion failure in the active dialog and retains confirmation for retry', async () => {
	const data = {
		dangerSettings: {
			currentMember: { role: 'owner', isOwner: true, isAdmin: false, canManageMembers: true },
			sections: {
				organization: {
					id: 'org-a',
					name: 'Example Organization',
					urlSlug: null,
					urlSegment: 'org-a',
					canUpdateProfile: true,
					canUpdateUrlSlug: true
				},
				dangerZone: {
					transferOwnershipCandidates: [],
					deleteConfirmation: {
						organizationName: 'Example Organization',
						normalizedOrganizationName: 'Example Organization'
					},
					commands: { canTransferOwnership: true, canDeleteOrganization: true }
				}
			}
		}
	} as unknown as ComponentProps<typeof Page>['data'];
	const view = render(Page, { data, form: null, params: { orgId: 'org-a' } });
	await fireEvent.click(screen.getByRole('button', { name: 'Delete Example Organization' }));
	const dialog = within(screen.getByRole('dialog', { name: 'Delete Organization' }));
	const input = dialog.getByRole('textbox');
	await fireEvent.input(input, { target: { value: 'Example Organization' } });
	await view.rerender({ data, form: { deleteError: 'Deletion is temporarily unavailable. Retry.' } });
	expect(dialog.getByRole('alert').textContent).toContain('Deletion is temporarily unavailable. Retry.');
	expect((input as HTMLInputElement).value).toBe('Example Organization');
	expect((dialog.getByRole('button', { name: 'Delete Permanently' }) as HTMLButtonElement).disabled).toBe(false);
	await fireEvent.click(dialog.getByRole('button', { name: 'Cancel' }));
	expect(screen.queryByRole('dialog')).toBeNull();
});
