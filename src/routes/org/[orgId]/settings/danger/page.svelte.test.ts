// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/svelte';
import type { ComponentProps } from 'svelte';
import type { ActionResult } from '@sveltejs/kit';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { frameworkOutcome } from '$lib/test-support/sveltekitEnhance';
import Page from './+page.svelte';

const { enhancements, stepUp } = vi.hoisted(() => ({
	enhancements: new Map<string, (...args: never[]) => unknown>(),
	stepUp: vi.fn(() => false)
}));
vi.mock('$app/forms', () => ({
	enhance: (node: HTMLFormElement, submit: (...args: never[]) => unknown) => {
		enhancements.set(node.id, submit);
	}
}));
vi.mock('$features/identity', () => ({ redirectToSensitiveActionStepUp: stepUp }));

beforeEach(() => {
	enhancements.clear();
	stepUp.mockClear();
	vi.useFakeTimers();
});
afterEach(async () => {
	cleanup();
	await vi.runAllTimersAsync();
	vi.useRealTimers();
});

function makeData(id = 'org-a') {
	return {
		orgId: id,
		dangerSettings: {
			currentMember: { role: 'owner', isOwner: true, isAdmin: false, canManageMembers: true },
			sections: {
				organization: {
					id,
					name: 'Example Organization',
					urlSlug: null,
					urlSegment: id,
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
}

it('shows a deletion failure in the active dialog and retains confirmation for retry', async () => {
	const data = makeData();
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

it('requires a fresh confirmation after an Organization switch, including identical names and A-B-A', async () => {
	const view = render(Page, { data: makeData(), form: null, params: { orgId: 'org-a' } });
	await fireEvent.click(screen.getByRole('button', { name: 'Delete Example Organization' }));
	await fireEvent.input(screen.getByRole('textbox'), { target: { value: 'Example Organization' } });
	await view.rerender({ data: makeData('org-b'), form: null });
	expect(screen.queryByRole('dialog')).toBeNull();
	await fireEvent.click(screen.getByRole('button', { name: 'Delete Example Organization' }));
	expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe('');
	expect((screen.getByRole('button', { name: 'Delete Permanently' }) as HTMLButtonElement).disabled).toBe(true);
	await view.rerender({ data: makeData(), form: null });
	expect(screen.queryByRole('dialog')).toBeNull();
});

it.each(['failure', 'redirect'] as const)(
	'ignores a disposed delete response (%s), including its step-up/navigation effects',
	async (type) => {
		const view = render(Page, { data: makeData(), form: null, params: { orgId: 'org-a' } });
		await fireEvent.click(screen.getByRole('button', { name: 'Delete Example Organization' }));
		const callback = enhancements.get('delete-org-form')!() as (input: unknown) => Promise<void>;
		await view.rerender({ data: makeData('org-b'), form: null });
		const update = vi.fn();
		await callback({
			result:
				type === 'redirect'
					? { type, status: 303, location: '/dashboard?show=all' }
					: { type, status: 403, data: { requiresStepUp: true } },
			update
		});
		expect(update).not.toHaveBeenCalled();
		expect(stepUp).not.toHaveBeenCalled();
		expect(screen.queryByRole('dialog')).toBeNull();
	}
);

const serverError: ActionResult = { type: 'error', status: 500, error: { message: 'Internal Error' } };

async function openTransfer() {
	const data = makeData();
	data.dangerSettings.sections.dangerZone.transferOwnershipCandidates = [
		{ id: 'm-1', userId: 'u-1', email: 'next@example.com', membershipRole: 'admin' }
	];
	const view = render(Page, { data, form: null, params: { orgId: 'org-a' } });
	const trigger = document.getElementById('transfer-owner-target')!;
	await fireEvent.pointerDown(trigger, { pointerType: 'mouse', button: 0 });
	await fireEvent.pointerUp(trigger, { pointerType: 'mouse', button: 0 });
	await vi.runAllTimersAsync();
	const option = screen.getByRole('option', { name: 'next@example.com' });
	await fireEvent.pointerUp(option, { pointerType: 'mouse', button: 0 });
	await fireEvent.click(screen.getByRole('button', { name: 'Transfer Ownership' }));
	await vi.runAllTimersAsync();
	const dialog = screen.getByRole('dialog', { name: 'Transfer Ownership' });
	await fireEvent.input(within(dialog).getByRole('textbox'), { target: { value: 'next@example.com' } });
	const callback = enhancements.get('transfer-ownership-form')!() as (input: unknown) => Promise<void>;
	return { view, data, dialog, callback };
}

it.each([
	[
		'failure',
		{ type: 'failure', status: 409, data: { transferError: 'Member is no longer eligible' } } as ActionResult
	],
	['error', serverError]
])('shows a %s transfer in an Alert inside its dialog and keeps the confirmation', async (_kind, result) => {
	const { view, data, dialog, callback } = await openTransfer();

	await callback(frameworkOutcome(result, { applyForm: (form) => view.rerender({ data, form: form as never }) }));

	expect(within(dialog).getByRole('alert')).toBeTruthy();
	expect((within(dialog).getByRole('textbox') as HTMLInputElement).value).toBe('next@example.com');
	expect(document.activeElement).toBe(within(dialog).getByRole('button', { name: 'Transfer Ownership' }));
});

it('keeps the delete confirmation with an Alert in its dialog when deletion errors', async () => {
	const data = makeData();
	const view = render(Page, { data, form: null, params: { orgId: 'org-a' } });
	await fireEvent.click(screen.getByRole('button', { name: 'Delete Example Organization' }));
	const dialog = screen.getByRole('dialog', { name: 'Delete Organization' });
	await fireEvent.input(within(dialog).getByRole('textbox'), { target: { value: 'Example Organization' } });
	const callback = enhancements.get('delete-org-form')!() as (input: unknown) => Promise<void>;

	await callback(frameworkOutcome(serverError, { applyForm: (form) => view.rerender({ data, form: form as never }) }));

	expect(within(dialog).getByRole('alert')).toBeTruthy();
	expect((within(dialog).getByRole('textbox') as HTMLInputElement).value).toBe('Example Organization');
	expect(document.activeElement).toBe(within(dialog).getByRole('button', { name: 'Delete Permanently' }));
});
