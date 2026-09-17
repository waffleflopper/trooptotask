// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import Page from './+page.svelte';

// Form submission transport is covered by the real action tests; inspect the
// rendered successful controls here without bootstrapping SvelteKit navigation.
vi.mock('$app/forms', () => ({ enhance: () => {} }));
afterEach(cleanup);

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
