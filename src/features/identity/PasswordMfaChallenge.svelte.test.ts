// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import PasswordMfaChallenge from './PasswordMfaChallenge.svelte';
import { controlCodeFieldTimers } from '$lib/test-support/codeFieldTimers';

controlCodeFieldTimers();
vi.mock('$app/navigation', () => ({ goto: vi.fn() }));
afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});
it('contains a failed verification after navigation unmounts the challenge', async () => {
	let reject!: (error: Error) => void;
	vi.stubGlobal(
		'fetch',
		() =>
			new Promise<Response>((_resolve, rejectRequest) => {
				reject = rejectRequest;
			})
	);
	const onverified = vi.fn();
	const view = render(PasswordMfaChallenge, { props: { onverified } });
	const code = screen.getByLabelText('Authenticator Code');
	await fireEvent.input(code, { target: { value: '123456' } });
	await view.unmount();
	reject(new Error('Connection lost'));
	// Drain the rejected request and DOM update; Vitest also rejects unhandled errors.
	await new Promise<void>((resolve) => setImmediate(resolve));
	expect(onverified).not.toHaveBeenCalled();
});

it('ties a rejected code to the Authenticator Code field and keeps an outage as a form alert', async () => {
	const fetchMock = vi
		.fn()
		.mockResolvedValueOnce(Response.json({ error: "That code didn't match. Try the next one." }, { status: 401 }))
		.mockResolvedValueOnce(Response.json({ error: 'Unable to verify MFA. Try again.' }, { status: 503 }));
	vi.stubGlobal('fetch', fetchMock);
	render(PasswordMfaChallenge, { props: { onverified: vi.fn() } });
	const code = screen.getByLabelText('Authenticator Code');

	await fireEvent.input(code, { target: { value: '123456' } });
	await waitFor(() => expect(code).toBeInvalid());
	expect(code).toHaveAccessibleDescription("That code didn't match. Try the next one.");

	await fireEvent.submit(code.closest('form')!);
	await waitFor(() => expect(code).toBeValid());
	expect(screen.getByRole('alert')).toHaveTextContent('Unable to verify MFA. Try again.');
});
