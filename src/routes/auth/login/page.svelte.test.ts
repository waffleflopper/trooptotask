// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import type { SubmitFunction } from '$app/forms';
import { frameworkOutcome, type FrameworkPage } from '$lib/test-support/sveltekitEnhance';
import Page from './+page.svelte';

const pageState = vi.hoisted(() => ({ url: new URL('http://app.invalid/auth/login') }));
vi.mock('$app/state', () => ({ page: pageState }));

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

it('links back to the public site from account access', () => {
	render(Page, { data: { viewer: null, reauth: false, nextPath: null }, form: null });
	expect(screen.getByRole('link', { name: 'TroopToTask.com' })).toHaveAttribute('href', '/');
});

it('submits the supplied continuation unchanged before and after a rejected login', async () => {
	const nextPath = '/org/alpha/calendar?view=month&label=A%26B#today';
	const data = { viewer: null, reauth: true, nextPath };
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

it('keeps the continuation in the address after a rejected login', async () => {
	const nextPath = '/org/alpha/calendar';
	render(Page, { data: { viewer: null, reauth: false, nextPath }, form: null });
	const framework: FrameworkPage = {
		path: `/auth/login?next=${encodeURIComponent(nextPath)}`,
		applyForm: async () => {}
	};

	const complete = submit({ cancel: vi.fn() });
	await complete(
		frameworkOutcome(
			{ type: 'failure', status: 400, location: '/auth/login', data: { error: 'Email or password is incorrect' } },
			framework
		)
	);

	expect(framework.location).toBeUndefined();
});

it('serializes submissions, contains transport errors and keeps entered credentials for retry', async () => {
	render(Page, { data: { viewer: null, reauth: false, nextPath: '/account/security' }, form: null });
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

it('adds a fragment the sign-in redirect kept in the address bar to the destination', async () => {
	pageState.url = new URL('http://app.invalid/auth/login?next=%2Fdashboard#invitation');
	render(Page, { data: { viewer: null, reauth: false, nextPath: '/dashboard' }, form: null });
	expect(new FormData(screen.getByLabelText(/Email Address/).closest('form')!).get('next')).toBe(
		'/dashboard#invitation'
	);
	pageState.url = new URL('http://app.invalid/auth/login');
});

it('keeps the destination returned by a failed sign-in that has no next in its address', () => {
	const form = {
		error: 'Email or password is incorrect',
		email: 'owner@example.test',
		nextPath: '/dashboard?show=all'
	};
	render(Page, { data: { viewer: null, reauth: false, nextPath: null }, form });
	expect(new FormData(screen.getByLabelText(/Email Address/).closest('form')!).get('next')).toBe('/dashboard?show=all');
});
