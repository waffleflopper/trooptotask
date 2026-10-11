// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import type { ActionResult, SubmitFunction } from '@sveltejs/kit';
import { frameworkOutcome } from '$lib/test-support/sveltekitEnhance';

const { invalidateAll, beforeNavigate } = vi.hoisted(() => ({ invalidateAll: vi.fn(), beforeNavigate: vi.fn() }));
vi.mock('$app/navigation', () => ({ invalidateAll, beforeNavigate }));

const { toastStore } = vi.hoisted(() => ({ toastStore: { success: vi.fn(), error: vi.fn() } }));
vi.mock('$lib/stores/toast.svelte', () => ({ toastStore }));

const { forms } = vi.hoisted(() => ({ forms: new Map<string, SubmitFunction>() }));
vi.mock('$app/forms', () => ({
	enhance: (form: HTMLFormElement, submit: SubmitFunction) => {
		forms.set(form.getAttribute('action')!, submit);
		return { destroy: () => forms.delete(form.getAttribute('action')!) };
	}
}));

import Page from './+page.svelte';
import type { PageData } from './$types';

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
	vi.resetAllMocks();
});

function makePageData(overrides: Partial<PageData> = {}): PageData {
	return {
		adminRole: 'super_admin',
		user: {
			id: '11111111-1111-4111-8111-111111111111',
			email: 'soldier@example.mil',
			createdAt: '2026-06-01T00:00:00.000Z',
			lastSignInAt: null,
			emailConfirmedAt: null,
			emailConfirmationStatus: 'pending'
		},
		organizations: [],
		suspension: null,
		isSuspended: false,
		recentActivity: [],
		...overrides
	} as PageData;
}

async function finishAcknowledgement(finish: (response: Response) => void) {
	const response = Response.json({ success: true });
	const decode = vi.spyOn(response, 'json');
	finish(response);
	await waitFor(() => expect(decode).toHaveBeenCalled());
	await decode.mock.results[0].value;
	await act();
}

async function submitAccountEmail(name: string) {
	await act();
	const button = screen.getByRole('button', { name });
	const form = button.closest('form')!;
	const input = {
		formElement: form,
		formData: new FormData(form),
		action: new URL(form.action),
		controller: new AbortController(),
		submitter: button,
		cancel: vi.fn()
	};
	const callback = await forms.get(form.getAttribute('action')!)!(input);
	await act();
	if (!callback) throw new Error('Form did not provide its response callback');
	return (
		result: ActionResult,
		update = frameworkOutcome(result, { form, applyForm: async () => {}, invalidate: () => invalidateAll() }).update
	) => callback({ ...input, result, update });
}

describe('admin user detail page', () => {
	it.each(['Send Password Reset', 'Resend Invite'])(
		'ignores a delayed %s result after leaving and reopening the account',
		async (name) => {
			const view = render(Page, { props: { data: makePageData() } });
			const finish = await submitAccountEmail(name);
			view.unmount();
			const reopened = render(Page, { props: { data: makePageData() } });
			const update = vi.fn(async () => {
				await reopened.rerender({ data: makePageData() });
			});
			await act(() => finish({ type: 'failure', status: 503, data: { error: 'Old account failure' } }, update));
			expect(screen.queryByRole('alert')).toBeNull();
			expect(update).not.toHaveBeenCalled();
		}
	);

	it('keeps a new account email submission busy when an older result arrives after A to B to A', async () => {
		const data = makePageData();
		const view = render(Page, { props: { data } });
		const old = await submitAccountEmail('Send Password Reset');
		const navigate = beforeNavigate.mock.calls[0][0];
		navigate();
		await view.rerender({ data: makePageData({ user: { ...data.user, id: 'other-user' } }) });
		navigate();
		await view.rerender({ data });
		const current = await submitAccountEmail('Send Password Reset');
		const staleUpdate = vi.fn(async () => {});
		await act(() => old({ type: 'failure', status: 500, data: { error: 'Old failure' } }, staleUpdate));
		expect(screen.getByRole('button', { name: /Send Password Reset/ }).getAttribute('aria-disabled')).toBe('true');
		expect(staleUpdate).not.toHaveBeenCalled();
		await act(() => current({ type: 'failure', status: 500, data: { error: 'Current failure' } }));
		expect(screen.getByRole('button', { name: 'Send Password Reset' }).getAttribute('aria-disabled')).toBe('false');
		expect(screen.getByRole('alert').textContent).toContain('Current failure');
		expect(screen.queryByText('Old failure')).toBeNull();
	});

	it.each(['Send Password Reset', 'Resend Invite'])(
		'releases %s after the acknowledged response cannot refresh account details',
		async (name) => {
			render(Page, { props: { data: makePageData() } });
			const finish = await submitAccountEmail(name);
			invalidateAll.mockRejectedValueOnce(new Error('read unavailable'));
			await act(() => finish({ type: 'success', status: 200, data: { success: true } }));
			expect(screen.getByRole('button', { name }).getAttribute('aria-disabled')).toBe('false');
			expect(screen.getByRole('alert').textContent).toContain(
				'Account details could not be refreshed. Check the current account before sending another email.'
			);
			expect(toastStore.success).not.toHaveBeenCalled();
			expect(invalidateAll).toHaveBeenCalledOnce();
		}
	);

	it('keeps support account assistance while hiding super-admin suspension controls', () => {
		render(Page, { props: { data: makePageData({ adminRole: 'support' }) } });
		expect(screen.getByRole('button', { name: 'Send Password Reset' })).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Resend Invite' })).toBeTruthy();
		expect(screen.queryByRole('button', { name: 'Suspend User' })).toBeNull();
	});

	it('refreshes the visible User state after suspension before offering unsuspension', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ success: true })));
		const view = render(Page, { props: { data: makePageData() } });
		invalidateAll.mockImplementation(async () => {
			await view.rerender({ data: makePageData({ isSuspended: true }) });
		});
		await fireEvent.click(screen.getByRole('button', { name: 'Suspend User' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Suspend' }));
		expect(await screen.findByRole('button', { name: 'Unsuspend User' })).toBeTruthy();
		await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
		expect(toastStore.success).toHaveBeenCalledExactlyOnceWith('User suspended');
	});

	it('does not refresh or announce an old mutation after navigation to another User', async () => {
		let finish!: (response: Response) => void;
		vi.stubGlobal(
			'fetch',
			vi.fn(
				() =>
					new Promise<Response>((resolve) => {
						finish = resolve;
					})
			)
		);
		const data = makePageData();
		const view = render(Page, { props: { data } });
		await fireEvent.click(screen.getByRole('button', { name: 'Suspend User' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Suspend' }));
		const navigate = beforeNavigate.mock.calls[0][0];
		navigate();
		await view.rerender({
			data: makePageData({
				user: { ...data.user, id: '22222222-2222-4222-8222-222222222222', email: 'other@example.test' }
			})
		});
		await finishAcknowledgement(finish);
		expect(screen.queryByRole('dialog')).toBeNull();
		expect(screen.getByRole('button', { name: 'Suspend User' })).toBeTruthy();
		expect(toastStore.success).not.toHaveBeenCalled();
		expect(invalidateAll).not.toHaveBeenCalled();
	});

	it('does not refresh another route when a pending mutation finishes after page destruction', async () => {
		let finish!: (response: Response) => void;
		vi.stubGlobal(
			'fetch',
			vi.fn(
				() =>
					new Promise<Response>((resolve) => {
						finish = resolve;
					})
			)
		);
		const view = render(Page, { props: { data: makePageData() } });
		await fireEvent.click(screen.getByRole('button', { name: 'Suspend User' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Suspend' }));
		view.unmount();
		await finishAcknowledgement(finish);
		expect(invalidateAll).not.toHaveBeenCalled();
		expect(toastStore.success).not.toHaveBeenCalled();
	});

	it('does not revive an old mutation after navigation away and back to the same User', async () => {
		let finish!: (response: Response) => void;
		vi.stubGlobal(
			'fetch',
			vi.fn(
				() =>
					new Promise<Response>((resolve) => {
						finish = resolve;
					})
			)
		);
		const data = makePageData();
		const view = render(Page, { props: { data } });
		await fireEvent.click(screen.getByRole('button', { name: 'Suspend User' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Suspend' }));
		const navigate = beforeNavigate.mock.calls[0][0];
		navigate();
		await view.rerender({ data: makePageData({ user: { ...data.user, id: 'other-user' } }) });
		navigate();
		await view.rerender({ data });
		await finishAcknowledgement(finish);
		expect(invalidateAll).not.toHaveBeenCalled();
		expect(toastStore.success).not.toHaveBeenCalled();
	});

	it.each([false, true])(
		'reads current suspension=%s after an uncertain result without announcing success',
		async (current) => {
			const fetch = vi.fn().mockRejectedValue(new Error('reply lost'));
			vi.stubGlobal('fetch', fetch);
			const view = render(Page, { props: { data: makePageData() } });
			invalidateAll.mockRejectedValueOnce(new Error('read unavailable')).mockImplementationOnce(async () => {
				await view.rerender({ data: makePageData({ isSuspended: current }) });
			});
			await fireEvent.click(screen.getByRole('button', { name: 'Suspend User' }));
			await fireEvent.click(screen.getByRole('button', { name: 'Suspend' }));
			await screen.findByRole('button', { name: 'Reload details' });
			await fireEvent.click(screen.getByRole('button', { name: 'Reload details' }));
			await screen.findByText(/Details could not be refreshed/);
			expect(screen.queryByRole('button', { name: 'Suspend' })).toBeNull();
			await fireEvent.click(screen.getByRole('button', { name: 'Reload details' }));
			if (current) {
				await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
				expect(screen.getByRole('button', { name: 'Unsuspend User' })).toBeTruthy();
			} else {
				expect(await screen.findByRole('button', { name: 'Suspend' })).toBeTruthy();
			}
			expect(toastStore.success).not.toHaveBeenCalled();
			expect(invalidateAll).toHaveBeenCalledTimes(2);
			expect(fetch).toHaveBeenCalledTimes(1);
		}
	);

	it('does not apply a pending read to another User after navigation', async () => {
		vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('reply lost')));
		let finish!: () => void;
		const data = makePageData();
		const view = render(Page, { props: { data } });
		invalidateAll.mockImplementation(
			() =>
				new Promise<void>((resolve) => {
					finish = resolve;
				})
		);
		await fireEvent.click(screen.getByRole('button', { name: 'Suspend User' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Suspend' }));
		await screen.findByRole('button', { name: 'Reload details' });
		await fireEvent.click(screen.getByRole('button', { name: 'Reload details' }));
		beforeNavigate.mock.calls[0][0]();
		await view.rerender({ data: makePageData({ user: { ...data.user, id: 'other-user' } }) });
		await act(() => {
			finish();
		});
		expect(screen.queryByRole('dialog')).toBeNull();
		expect(toastStore.success).not.toHaveBeenCalled();
		expect(invalidateAll).toHaveBeenCalledTimes(1);
	});
	it('announces a sent email through the app toast once the account is current', async () => {
		render(Page, { props: { data: makePageData() } });
		const button = screen.getByRole('button', { name: 'Resend Invite' });
		button.focus();
		const finish = await submitAccountEmail('Resend Invite');

		await act(() => finish({ type: 'success', status: 200, data: { success: true, message: 'Invite email resent' } }));

		expect(invalidateAll).toHaveBeenCalledOnce();
		expect(toastStore.success).toHaveBeenCalledExactlyOnceWith('Invite email resent');
		expect(screen.queryByRole('alert')).toBeNull();
		expect(document.activeElement).toBe(button);
	});

	it('keeps the page and shows the email failure in context when the request errors', async () => {
		render(Page, { props: { data: makePageData() } });
		const button = screen.getByRole('button', { name: 'Send Password Reset' });
		button.focus();
		const finish = await submitAccountEmail('Send Password Reset');

		await act(() => finish({ type: 'error', status: 500, error: new Error('Failed to fetch') }));

		expect(screen.getByRole('alert').textContent).toContain('The email could not be sent.');
		expect(button.getAttribute('aria-disabled')).toBe('false');
		expect(document.activeElement).toBe(button);
		expect(invalidateAll).not.toHaveBeenCalled();
	});

	it('keeps focus on Send Password Reset while the email is pending and ignores another press', async () => {
		render(Page, { props: { data: makePageData() } });
		const button = screen.getByRole('button', { name: 'Send Password Reset' });
		button.focus();
		const finish = await submitAccountEmail('Send Password Reset');

		expect(button.getAttribute('aria-disabled')).toBe('true');
		expect(button.getAttribute('aria-busy')).toBe('true');
		expect((button as HTMLButtonElement).disabled).toBe(false);
		expect(document.activeElement).toBe(button);
		const form = button.closest('form')!;
		const cancel = vi.fn();
		await forms.get(form.getAttribute('action')!)!({
			formElement: form,
			formData: new FormData(form),
			action: new URL(form.action),
			controller: new AbortController(),
			submitter: button,
			cancel
		});
		expect(cancel).toHaveBeenCalledOnce();

		await act(() => finish({ type: 'failure', status: 503, data: { error: 'Synthetic request failure' } }));
		expect(button.getAttribute('aria-disabled')).toBe('false');
		expect(document.activeElement).toBe(button);
		expect(screen.getByRole('alert').textContent).toContain('Synthetic request failure');
		expect(toastStore.error).not.toHaveBeenCalled();
	});

	it('keeps a failed email in context until the next attempt or navigation', async () => {
		render(Page, { props: { data: makePageData() } });
		const first = await submitAccountEmail('Resend Invite');
		await act(() => first({ type: 'failure', status: 503, data: { error: 'Mail service unavailable' } }));
		expect(screen.getByRole('alert').textContent).toContain('Mail service unavailable');

		const second = await submitAccountEmail('Resend Invite');
		expect(screen.queryByRole('alert')).toBeNull();
		await act(() => second({ type: 'failure', status: 503, data: { error: 'Still unavailable' } }));
		expect(screen.getByRole('alert').textContent).toContain('Still unavailable');

		await act(() => beforeNavigate.mock.calls[0][0]());
		expect(screen.queryByRole('alert')).toBeNull();
	});

	it('offers resend invite only while account confirmation is pending', () => {
		render(Page, { props: { data: makePageData() } });
		expect(screen.getByRole('button', { name: 'Resend Invite' })).toBeTruthy();
		cleanup();
		render(Page, {
			props: {
				data: makePageData({
					user: { ...makePageData().user, emailConfirmationStatus: 'confirmed' }
				})
			}
		});
		expect(screen.queryByRole('button', { name: 'Resend Invite' })).toBeNull();
	});
});
