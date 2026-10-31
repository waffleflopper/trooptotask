// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/svelte';
import type { ComponentProps } from 'svelte';
import type { ActionResult } from '$app/forms';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { frameworkOutcome } from '$lib/test-support/sveltekitEnhance';
import Page from './+page.svelte';

const { enhancements, stepUp } = vi.hoisted(() => ({
	enhancements: new Map<string, (input: { cancel: () => void }) => unknown>(),
	stepUp: vi.fn(() => false)
}));
vi.mock('$app/forms', () => ({
	enhance: (node: HTMLFormElement, submit: (input: { cancel: () => void }) => unknown) => {
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

const COUNTS = { activePersonnel: 22, trainingRecords: 912, members: 24, archivedPersonnel: 1 };

function makeData(id = 'org-a', destructionCounts: Promise<typeof COUNTS> = Promise.resolve(COUNTS)) {
	return {
		orgId: id,
		orgName: 'Example Organization',
		dangerSettings: { transferOwnershipCandidates: [], destructionCounts }
	} as unknown as ComponentProps<typeof Page>['data'];
}

async function openDelete() {
	await fireEvent.click(screen.getByRole('button', { name: 'Delete unit…' }));
	return screen.getByRole('dialog', { name: 'Delete Example Organization?' });
}

it('lists what deleting the unit destroys once the counts arrive', async () => {
	const counts = Promise.withResolvers<typeof COUNTS>();
	render(Page, { data: makeData('org-a', counts.promise), form: null, params: { orgId: 'org-a' } });
	expect(screen.getByText('Counting what deleting Example Organization destroys')).toBeTruthy();
	expect(screen.getByRole('button', { name: 'Delete unit…' })).toBeTruthy();

	counts.resolve(COUNTS);
	await vi.runAllTimersAsync();

	const list = screen.getByRole('list', { name: 'What deleting Example Organization destroys' });
	expect(
		within(list)
			.getAllByRole('listitem')
			.map((item) => item.textContent?.replace(/\s+/g, ' ').trim())
	).toEqual(['22 people', '912 training records', '24 members lose access', '1 archived record']);
});

it('keeps Delete unit usable when the counts fail', async () => {
	render(Page, {
		data: makeData('org-a', Promise.reject(new Error('count failed'))),
		form: null,
		params: { orgId: 'org-a' }
	});
	await vi.runAllTimersAsync();

	expect(screen.queryByRole('list', { name: 'What deleting Example Organization destroys' })).toBeNull();
	expect(screen.getByText('What deleting Example Organization destroys could not be counted.')).toBeTruthy();
	expect(await openDelete()).toBeTruthy();
});

it('enables Delete permanently only once the typed name matches exactly', async () => {
	render(Page, { data: makeData(), form: null, params: { orgId: 'org-a' } });
	const dialog = within(await openDelete());
	const input = dialog.getByRole('textbox', { name: 'Type Example Organization to confirm' });
	const remove = dialog.getByRole('button', { name: 'Delete permanently' }) as HTMLButtonElement;

	for (const partial of ['', 'Example Organ', 'example organization', 'Example Organization Two']) {
		await fireEvent.input(input, { target: { value: partial } });
		expect(remove.disabled).toBe(true);
		expect(input).toHaveAccessibleDescription('Keep typing. It has to match exactly.');
	}

	await fireEvent.input(input, { target: { value: '  Example   Organization ' } });
	expect(remove.disabled).toBe(false);
	expect(input).not.toHaveAccessibleDescription();
	expect(dialog.queryByText('Keep typing. It has to match exactly.')).toBeNull();
});

it('shows a deletion failure in the active dialog and retains confirmation for retry', async () => {
	const data = makeData();
	const view = render(Page, { data, form: null, params: { orgId: 'org-a' } });
	const dialog = within(await openDelete());
	const input = dialog.getByRole('textbox');
	await fireEvent.input(input, { target: { value: 'Example Organization' } });
	await view.rerender({ data, form: { deleteError: 'Deletion is temporarily unavailable. Retry.' } });
	expect(dialog.getByRole('alert').textContent).toContain('Deletion is temporarily unavailable. Retry.');
	expect((input as HTMLInputElement).value).toBe('Example Organization');
	expect((dialog.getByRole('button', { name: 'Delete permanently' }) as HTMLButtonElement).disabled).toBe(false);
	await fireEvent.click(dialog.getByRole('button', { name: 'Cancel' }));
	expect(screen.queryByRole('dialog')).toBeNull();
});

it('requires a fresh confirmation after an Organization switch, including identical names and A-B-A', async () => {
	const view = render(Page, { data: makeData(), form: null, params: { orgId: 'org-a' } });
	await openDelete();
	await fireEvent.input(screen.getByRole('textbox'), { target: { value: 'Example Organization' } });
	await view.rerender({ data: makeData('org-b'), form: null });
	expect(screen.queryByRole('dialog')).toBeNull();
	await openDelete();
	expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe('');
	expect((screen.getByRole('button', { name: 'Delete permanently' }) as HTMLButtonElement).disabled).toBe(true);
	await view.rerender({ data: makeData(), form: null });
	expect(screen.queryByRole('dialog')).toBeNull();
});

it.each(['failure', 'redirect'] as const)(
	'ignores a disposed delete response (%s), including its step-up/navigation effects',
	async (type) => {
		const view = render(Page, { data: makeData(), form: null, params: { orgId: 'org-a' } });
		await openDelete();
		const callback = enhancements.get('delete-org-form')!({ cancel: () => {} }) as (input: unknown) => Promise<void>;
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

const serverError: ActionResult = { type: 'error', status: 500, error: { status: 500, message: 'Internal Error' } };

async function chooseTransferTarget() {
	const data = makeData();
	data.dangerSettings.transferOwnershipCandidates = [
		{ id: 'm-1', userId: 'u-1', email: 'next@example.com', membershipRole: 'admin' }
	];
	const view = render(Page, { data, form: null, params: { orgId: 'org-a' } });
	const trigger = document.getElementById('transfer-owner-target')!;
	await fireEvent.pointerDown(trigger, { pointerType: 'mouse', button: 0 });
	await fireEvent.pointerUp(trigger, { pointerType: 'mouse', button: 0 });
	await vi.runAllTimersAsync();
	const option = screen.getByRole('option', { name: 'next@example.com' });
	await fireEvent.pointerUp(option, { pointerType: 'mouse', button: 0 });
	await fireEvent.click(screen.getByRole('button', { name: 'Transfer' }));
	await vi.runAllTimersAsync();
	const dialog = screen.getByRole('dialog', { name: 'Make next@example.com the Owner?' });
	return { view, data, dialog };
}

async function openTransfer() {
	const { view, data, dialog } = await chooseTransferTarget();
	await fireEvent.input(within(dialog).getByRole('textbox'), { target: { value: 'next@example.com' } });
	const callback = enhancements.get('transfer-ownership-form')!({ cancel: () => {} }) as (
		input: unknown
	) => Promise<void>;
	return { view, data, dialog, callback };
}

it.each([
	[
		'failure',
		{
			type: 'failure',
			status: 409,
			location: '/',
			data: { transferError: 'Member is no longer eligible' }
		} as ActionResult
	],
	['error', serverError]
])('shows a %s transfer in an Alert inside its dialog and keeps the confirmation', async (_kind, result) => {
	const { view, data, dialog, callback } = await openTransfer();

	await callback(frameworkOutcome(result, { applyForm: (form) => view.rerender({ data, form: form as never }) }));

	expect(within(dialog).getByRole('alert')).toBeTruthy();
	expect((within(dialog).getByRole('textbox') as HTMLInputElement).value).toBe('next@example.com');
	expect(document.activeElement).toBe(within(dialog).getByRole('button', { name: 'Transfer ownership' }));
});

it('names the email to type and enables Transfer ownership once it matches, ignoring case', async () => {
	const { dialog } = await chooseTransferTarget();
	const input = within(dialog).getByRole('textbox', { name: 'Type next@example.com to confirm' });
	const transfer = within(dialog).getByRole('button', { name: 'Transfer ownership' }) as HTMLButtonElement;

	for (const partial of ['', 'next@example', 'other@example.com']) {
		await fireEvent.input(input, { target: { value: partial } });
		expect(transfer.disabled).toBe(true);
		expect(input).toHaveAccessibleDescription('Keep typing. It has to match exactly.');
	}

	await fireEvent.input(input, { target: { value: ' Next@Example.com ' } });
	expect(transfer.disabled).toBe(false);
	expect(input).not.toHaveAccessibleDescription();
});

it('keeps the delete confirmation with an Alert in its dialog when deletion errors', async () => {
	const data = makeData();
	const view = render(Page, { data, form: null, params: { orgId: 'org-a' } });
	const dialog = await openDelete();
	await fireEvent.input(within(dialog).getByRole('textbox'), { target: { value: 'Example Organization' } });
	const callback = enhancements.get('delete-org-form')!({ cancel: () => {} }) as (input: unknown) => Promise<void>;

	await callback(frameworkOutcome(serverError, { applyForm: (form) => view.rerender({ data, form: form as never }) }));

	expect(within(dialog).getByRole('alert')).toBeTruthy();
	expect((within(dialog).getByRole('textbox') as HTMLInputElement).value).toBe('Example Organization');
	expect(document.activeElement).toBe(within(dialog).getByRole('button', { name: 'Delete permanently' }));
});

it('keeps focus on Delete permanently while deletion is pending and ignores a second submission', async () => {
	render(Page, { data: makeData(), form: null, params: { orgId: 'org-a' } });
	const dialog = await openDelete();
	await fireEvent.input(within(dialog).getByRole('textbox'), { target: { value: 'Example Organization' } });
	const remove = within(dialog).getByRole('button', { name: 'Delete permanently' }) as HTMLButtonElement;
	remove.focus();

	const submit = enhancements.get('delete-org-form')!;
	const first = vi.fn();
	submit({ cancel: first });
	await vi.runAllTimersAsync();

	expect(first).not.toHaveBeenCalled();
	expect(remove.textContent?.trim()).toBe('Deleting...');
	expect(remove.disabled).toBe(false);
	expect(remove.getAttribute('aria-disabled')).toBe('true');
	expect(document.activeElement).toBe(remove);
	const repeat = vi.fn();
	submit({ cancel: repeat });
	expect(repeat).toHaveBeenCalledOnce();
});

it('keeps focus on Transfer ownership while the transfer is pending and ignores a second submission', async () => {
	const { dialog } = await openTransfer();
	await vi.runAllTimersAsync();
	const transfer = within(dialog).getByRole('button', { name: 'Transferring...' }) as HTMLButtonElement;
	transfer.focus();

	expect(transfer.disabled).toBe(false);
	expect(transfer.getAttribute('aria-disabled')).toBe('true');
	expect(document.activeElement).toBe(transfer);
	const repeat = vi.fn();
	enhancements.get('transfer-ownership-form')!({ cancel: repeat });
	expect(repeat).toHaveBeenCalledOnce();
});

it('names the transfer member listbox after its field', async () => {
	render(Page, { data: makeData(), form: null, params: { orgId: 'org-a' } });
	await fireEvent.keyDown(screen.getByRole('button', { name: 'Transfer ownership' }), { key: 'ArrowDown' });
	await vi.runAllTimersAsync();
	expect(screen.getByRole('listbox', { name: 'Transfer ownership' })).toBeTruthy();
});
