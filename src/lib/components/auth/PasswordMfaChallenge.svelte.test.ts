// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import PasswordMfaChallenge from './PasswordMfaChallenge.svelte';
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
	// Dispatch through the real form and wait for its handler to settle after unmount.
	const form = code.closest('form')!;
	await fireEvent.submit(form);
	await view.unmount();
	reject(new Error('Connection lost'));
	// Drain the rejected request and DOM update; Vitest also rejects unhandled errors.
	await new Promise<void>((resolve) => setImmediate(resolve));
	expect(onverified).not.toHaveBeenCalled();
});
