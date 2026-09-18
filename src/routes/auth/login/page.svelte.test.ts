// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import type { SubmitFunction } from '@sveltejs/kit';
import Page from './+page.svelte';

// Form submission transport is covered by the real action tests; inspect the
// rendered successful controls here without bootstrapping SvelteKit navigation.
const { submit } = vi.hoisted(() => ({ submit: vi.fn() }));
vi.mock('$app/forms', () => ({
	enhance: (_form: HTMLFormElement, handler: SubmitFunction) => {
		submit.mockImplementation(handler);
	}
}));
afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

it('submits the supplied continuation unchanged before and after a rejected login', async () => {
	const nextPath = '/org/alpha/calendar?view=month&label=A%26B#today';
	const data = { session: null, reauth: true, nextPath };
	const page = render(Page, { data, form: null });
	const email = screen.getByLabelText(/Email Address/);
	await fireEvent.input(email, { target: { value: 'owner@example.test' } });
	await fireEvent.input(screen.getByLabelText(/^Password/), { target: { value: 'synthetic-password' } });
	expect(new FormData(email.closest('form')!).get('next')).toBe(nextPath);

	const rejectedForm = { error: 'Email or password is incorrect', email: 'owner@example.test', nextPath };
	await page.rerender({ data, form: rejectedForm });
	expect(screen.getByRole('alert')).toBeTruthy();
	expect(new FormData(screen.getByLabelText(/Email Address/).closest('form')!).get('next')).toBe(nextPath);
});

it('serializes submissions, contains transport errors and keeps entered credentials for retry', async () => {
	render(Page, { data: { session: null, reauth: false, nextPath: '/account/security' }, form: null });
	const email = screen.getByLabelText(/Email Address/);
	const password = screen.getByLabelText(/^Password/);
	await fireEvent.input(email, { target: { value: 'owner@example.test' } });
	await fireEvent.input(password, { target: { value: 'synthetic-password' } });
	const complete = submit({ cancel: vi.fn() });
	await waitFor(() => expect(screen.getByRole('button', { name: /Signing In/ })).toBeDisabled());
	expect(email).toBeDisabled();
	expect(password).toBeDisabled();
	const cancel = vi.fn();
	submit({ cancel });
	expect(cancel).toHaveBeenCalledOnce();
	const update = vi.fn();
	await complete({ result: { type: 'error', error: new Error('private transport detail') }, update });
	expect(await screen.findByRole('alert')).not.toHaveTextContent('private transport detail');
	expect(update).not.toHaveBeenCalled();
	expect(email).toHaveValue('owner@example.test');
	expect(password).toHaveValue('synthetic-password');
	expect(screen.getByRole('button', { name: 'Sign In' })).toBeEnabled();
	const retry = submit({ cancel: vi.fn() });
	let finish!: () => void;
	const updating = retry({
		result: { type: 'failure', status: 400, data: {} },
		update: () =>
			new Promise<void>((resolve) => {
				finish = resolve;
			})
	});
	await waitFor(() => expect(screen.getByRole('button', { name: /Signing In/ })).toBeDisabled());
	finish();
	await updating;
	await waitFor(() => expect(screen.getByRole('button', { name: 'Sign In' })).toBeEnabled());
	const failedUpdate = submit({ cancel: vi.fn() });
	await failedUpdate({
		result: { type: 'redirect', location: '/dashboard' },
		update: vi.fn().mockRejectedValue(new Error('navigation failed'))
	});
	expect(await screen.findByRole('alert')).toBeTruthy();
	expect(password).toHaveValue('synthetic-password');
});
