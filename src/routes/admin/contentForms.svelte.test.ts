// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import type { ActionResult, SubmitFunction } from '@sveltejs/kit';
import { frameworkOutcome } from '$lib/test-support/sveltekitEnhance';
import Announcements from './announcements/+page.svelte';
import type { PageData as AnnouncementData } from './announcements/$types';

const { forms, invalidateAll, navigation, gotoMock } = vi.hoisted(() => ({
	gotoMock: vi.fn(),
	forms: new Map<string, SubmitFunction>(),
	invalidateAll: vi.fn(),
	navigation: [] as Array<() => void>
}));
vi.mock('$app/navigation', () => ({
	goto: gotoMock,
	invalidateAll,
	beforeNavigate: (callback: () => void) => navigation.push(callback)
}));
vi.mock('$app/forms', () => ({
	enhance: (form: HTMLFormElement, submit: SubmitFunction) => {
		forms.set(formKey(form), submit);
		return { destroy: () => forms.delete(formKey(form)) };
	}
}));

const notice: AnnouncementData['announcements'][number] = {
	id: '11111111-1111-4111-8111-111111111111',
	title: 'Active notice',
	message: 'Keep this notice',
	type: 'info',
	is_active: true,
	created_at: '2026-10-01T12:00:00Z',
	expires_at: null
};
function adminData(
	actorId: string
): Pick<AnnouncementData, 'viewer' | 'adminUserId' | 'adminEmail' | 'inboxOpenCount'> {
	return { viewer: null, adminUserId: actorId, adminEmail: 'admin@example.test', inboxOpenCount: Promise.resolve(0) };
}
function announcementData(actorId = 'admin-a'): AnnouncementData {
	return {
		...adminData(actorId),
		announcements: [
			notice,
			{ ...notice, id: '22222222-2222-4222-8222-222222222222', title: 'Peer notice', is_active: false }
		]
	};
}
const failed: ActionResult = { type: 'failure', status: 400, data: { error: 'Current request failed' } };
const succeeded: ActionResult = { type: 'success', status: 200, data: { success: true } };
const uncertainResults: ActionResult[] = [
	{ type: 'error', status: 500, error: new Error('Private transport detail') },
	{ type: 'failure', status: 500, data: { error: 'Private provider detail' } }
];

beforeEach(() => {
	invalidateAll.mockResolvedValue(undefined);
});
afterEach(() => {
	cleanup();
	forms.clear();
	navigation.length = 0;
	vi.resetAllMocks();
	vi.unstubAllGlobals();
});

function formKey(form: HTMLFormElement) {
	const fields = new FormData(form);
	return `${form.getAttribute('action')}:${fields.get('id') ?? ''}`;
}

async function submit(button: HTMLElement) {
	await act();
	const form = button.closest('form')!;
	const input = {
		formElement: form,
		formData: new FormData(form),
		action: new URL(form.action),
		controller: new AbortController(),
		submitter: button,
		cancel: vi.fn()
	};
	let callback: Awaited<ReturnType<SubmitFunction>>;
	await act(async () => {
		const handler = forms.get(formKey(form));
		if (!handler)
			throw new Error(
				`Form enhancement unavailable: ${forms.size} registrations, selected ${form?.getAttribute('action')}`
			);
		callback = await handler(input);
	});
	return {
		cancel: input.cancel,
		finish: async (result: ActionResult) => {
			if (!callback) throw new Error('Submission was canceled');
			await act(async () => {
				await callback!({
					...input,
					...frameworkOutcome(result, { form, applyForm: async () => {}, invalidate: () => invalidateAll() })
				});
			});
		}
	};
}
async function openAnnouncement() {
	await fireEvent.click(screen.getByRole('button', { name: 'Create Announcement' }));
	await fireEvent.input(screen.getByLabelText('Title'), { target: { value: 'Unsent title' } });
	await fireEvent.input(screen.getByLabelText('Message'), { target: { value: 'Unsent message' } });
}

describe('announcement form ownership', () => {
	it.each(uncertainResults)(
		'requires readback after an unconfirmed $type before permitting another mutation',
		async (result) => {
			render(Announcements, { props: { data: announcementData(), form: null } });
			await openAnnouncement();
			await (await submit(screen.getByRole('button', { name: 'Save' }))).finish(result);
			expect(screen.getByLabelText('Title')).toHaveProperty('value', 'Unsent title');
			expect(screen.getByRole('button', { name: 'Save' })).toHaveProperty('disabled', true);
			expect(screen.queryByText(/Private (transport|provider) detail/)).toBeNull();
			expect(
				(await submit(screen.getByRole('button', { name: 'Deactivate Active notice' }))).cancel
			).toHaveBeenCalledOnce();
			expect(invalidateAll).not.toHaveBeenCalled();
			await fireEvent.click(screen.getByRole('button', { name: 'Reload Announcements' }));
			await waitFor(() => expect(screen.getByRole('button', { name: 'Save' })).toHaveProperty('disabled', false));
			expect(invalidateAll).toHaveBeenCalledOnce();
		}
	);
	it('asks for confirmation naming the announcement before a Delete can dispatch or lock the page', async () => {
		render(Announcements, { props: { data: announcementData(), form: null } });
		const deleteButton = screen.getByRole('button', { name: 'Delete Active notice' });
		const request = await submit(deleteButton);
		expect(request.cancel).toHaveBeenCalledOnce();
		const dialog = screen.getByRole('alertdialog');
		expect(dialog.textContent).toContain('Delete "Active notice"? This cannot be undone.');
		expect(deleteButton).toHaveProperty('disabled', false);
		await fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
		await waitFor(() => expect(document.activeElement).toBe(deleteButton));
		expect(screen.queryByRole('alertdialog')).toBeNull();
		expect(invalidateAll).not.toHaveBeenCalled();
	});

	it('submits the Delete only after its confirmation, stays busy until the result, then focuses Create Announcement', async () => {
		const view = render(Announcements, { props: { data: announcementData(), form: null } });
		const deleteButton = screen.getByRole('button', { name: 'Delete Active notice' });
		const requestSubmit = vi.spyOn(deleteButton.closest('form')!, 'requestSubmit').mockImplementation(() => {});
		await submit(deleteButton);
		await fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Delete' }));
		expect(requestSubmit).toHaveBeenCalledWith(deleteButton);
		const confirmed = await submit(deleteButton);
		expect(confirmed.cancel).not.toHaveBeenCalled();
		invalidateAll.mockImplementationOnce(async () => {
			const remaining = announcementData();
			await view.rerender({
				data: { ...remaining, announcements: remaining.announcements.slice(1) },
				form: null
			});
		});
		expect(screen.getByRole('alertdialog').getAttribute('aria-busy')).toBe('true');
		await confirmed.finish(succeeded);
		expect(screen.queryByRole('alertdialog')).toBeNull();
		await waitFor(() =>
			expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Create Announcement' }))
		);
	});

	it('offers Create Announcement from the toolbar only while the create form is closed', async () => {
		render(Announcements, { props: { data: announcementData(), form: null } });
		expect(
			within(screen.getByRole('toolbar', { name: 'Announcements controls' })).getByRole('button', {
				name: 'Create Announcement'
			})
		).toBeTruthy();
		await openAnnouncement();
		expect(screen.queryByRole('toolbar', { name: 'Announcements controls' })).toBeNull();
		expect(screen.queryByRole('button', { name: 'Create Announcement' })).toBeNull();
	});

	it('focuses Title on open and Create Announcement on cancel and after a save', async () => {
		render(Announcements, { props: { data: announcementData(), form: null } });
		await openAnnouncement();
		await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText('Title')));
		await fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
		await waitFor(() =>
			expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Create Announcement' }))
		);
		await openAnnouncement();
		await (await submit(screen.getByRole('button', { name: 'Save' }))).finish(succeeded);
		await waitFor(() =>
			expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Create Announcement' }))
		);
	});

	it.each([
		['Deactivate Active notice', 'false'],
		['Activate Peer notice', 'true']
	])('%s submits the desired active state %s', async (name, isActive) => {
		render(Announcements, { props: { data: announcementData(), form: null } });
		const button = screen.getByRole('button', { name });
		expect(new FormData(button.closest('form')!).get('isActive')).toBe(isActive);
	});

	it('returns focus to the toggled announcement button after its re-read', async () => {
		render(Announcements, { props: { data: announcementData(), form: null } });
		const toggle = screen.getByRole('button', { name: 'Deactivate Active notice' });
		await (await submit(toggle)).finish(succeeded);
		await waitFor(() => expect(document.activeElement).toBe(toggle));
	});

	it('keeps the pressed toggle focusable and busy while its save is held, and ignores another press', async () => {
		render(Announcements, { props: { data: announcementData(), form: null } });
		const toggle = screen.getByRole('button', { name: 'Deactivate Active notice' });
		toggle.focus();
		const request = await submit(toggle);
		expect(toggle).toHaveProperty('disabled', false);
		expect(toggle.getAttribute('aria-disabled')).toBe('true');
		expect(toggle.getAttribute('aria-busy')).toBe('true');
		expect(document.activeElement).toBe(toggle);
		expect((await submit(toggle)).cancel).toHaveBeenCalledOnce();
		await request.finish(succeeded);
		expect(toggle.getAttribute('aria-busy')).toBeNull();
		expect(invalidateAll).toHaveBeenCalledOnce();
	});

	it('retains the current create draft after failure and closes it only after its own successful retry', async () => {
		render(Announcements, { props: { data: announcementData(), form: null } });
		await openAnnouncement();
		await (await submit(screen.getByRole('button', { name: 'Save' }))).finish(failed);
		expect(screen.getByLabelText('Title')).toHaveProperty('value', 'Unsent title');
		expect(screen.getByLabelText('Message')).toHaveProperty('value', 'Unsent message');
		expect(screen.getByText('Current request failed')).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Save' })).toHaveProperty('disabled', false);
		await (await submit(screen.getByRole('button', { name: 'Save' }))).finish(succeeded);
		expect(screen.queryByLabelText('Title')).toBeNull();
		expect(invalidateAll).toHaveBeenCalledOnce();
	});

	it.each([failed, succeeded])(
		'keeps a reopened unsent draft when the retired editor completes with $type',
		async (result) => {
			render(Announcements, { props: { data: announcementData(), form: null } });
			await openAnnouncement();
			const request = await submit(screen.getByRole('button', { name: 'Save' }));
			await fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
			await openAnnouncement();
			await fireEvent.input(screen.getByLabelText('Title'), { target: { value: 'Fresh unsent title' } });
			await request.finish(result);
			expect(screen.getByLabelText('Title')).toHaveProperty('value', 'Fresh unsent title');
			expect(screen.queryByText('Current request failed')).toBeNull();
			expect(screen.getByRole('button', { name: 'Save' })).toHaveProperty('disabled', false);
			expect(invalidateAll).toHaveBeenCalledTimes(result.type === 'success' ? 1 : 0);
		}
	);

	it('holds the whole-page write lock until authoritative readback finishes', async () => {
		let release!: () => void;
		invalidateAll.mockImplementation(
			() =>
				new Promise<void>((resolve) => {
					release = resolve;
				})
		);
		render(Announcements, { props: { data: announcementData(), form: null } });
		const request = await submit(screen.getByRole('button', { name: 'Deactivate Active notice' }));
		expect((await submit(screen.getByRole('button', { name: 'Activate Peer notice' }))).cancel).toHaveBeenCalledOnce();
		const completion = request.finish(succeeded);
		await waitFor(() => expect(invalidateAll).toHaveBeenCalledOnce());
		expect(screen.getByRole('button', { name: 'Activate Peer notice' }).getAttribute('aria-disabled')).toBe('true');
		expect((await submit(screen.getByRole('button', { name: 'Delete Peer notice' }))).cancel).toHaveBeenCalledOnce();
		release();
		await completion;
		expect(screen.getByRole('button', { name: 'Activate Peer notice' }).getAttribute('aria-disabled')).toBeNull();
	});

	it('blocks repeat mutations after read failure and recovers using a read-only reload', async () => {
		invalidateAll.mockRejectedValueOnce(new Error('Private provider failure'));
		render(Announcements, { props: { data: announcementData(), form: null } });
		await (await submit(screen.getByRole('button', { name: 'Deactivate Active notice' }))).finish(succeeded);
		expect(screen.getByRole('button', { name: 'Activate Peer notice' })).toHaveProperty('disabled', true);
		expect(screen.queryByText('Private provider failure')).toBeNull();
		expect(
			screen.getByText('Saved, but announcements could not be refreshed. Reload them before another save.')
		).toBeTruthy();
		expect(
			(await submit(screen.getByRole('button', { name: 'Deactivate Active notice' }))).cancel
		).toHaveBeenCalledOnce();
		const reload = screen.getByRole('button', { name: 'Reload Announcements' });
		reload.focus();
		await fireEvent.click(reload);
		await waitFor(() =>
			expect(screen.getByRole('button', { name: 'Deactivate Active notice' })).toHaveProperty('disabled', false)
		);
		expect(invalidateAll).toHaveBeenCalledTimes(2);
		await waitFor(() =>
			expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Create Announcement' }))
		);
	});

	it.each([failed, succeeded])('ignores a previous page reply after leaving and returning ($type)', async (result) => {
		render(Announcements, { props: { data: announcementData(), form: null } });
		await openAnnouncement();
		const old = await submit(screen.getByRole('button', { name: 'Save' }));
		await act(() => navigation[0]());
		await openAnnouncement();
		const fresh = await submit(screen.getByRole('button', { name: 'Save' }));
		await old.finish(result);
		expect(screen.getByRole('button', { name: /Saving/ }).getAttribute('aria-busy')).toBe('true');
		expect(screen.getByLabelText('Title')).toHaveProperty('value', 'Unsent title');
		expect(invalidateAll).not.toHaveBeenCalled();
		await fresh.finish(failed);
		expect(screen.getByRole('button', { name: 'Save' })).toHaveProperty('disabled', false);
	});

	it('retires pending state when the admitted actor changes', async () => {
		const view = render(Announcements, { props: { data: announcementData(), form: null } });
		const old = await submit(screen.getByRole('button', { name: 'Deactivate Active notice' }));
		await view.rerender({ data: announcementData('admin-b'), form: null });
		expect(screen.getByRole('button', { name: 'Deactivate Active notice' })).toHaveProperty('disabled', false);
		await old.finish(failed);
		expect(screen.queryByText('Current request failed')).toBeNull();
	});
});
