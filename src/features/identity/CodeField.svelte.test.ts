// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest';
import { afterAll, afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import CodeField from './CodeField.svelte';
import { controlCodeFieldTimers } from '$lib/test-support/codeFieldTimers';

controlCodeFieldTimers();

afterEach(cleanup);
// bits-ui PinInput schedules uncancelled input syncs up to 50 ms after a change; let them run before happy-dom tears down.
afterAll(() => new Promise((resolve) => setTimeout(resolve, 60)));

it('takes focus on mount when asked, so a code can be typed without a click', async () => {
	render(CodeField, { props: { id: 'mfa-code', label: 'Verification code', autofocus: true } });
	expect(screen.getByLabelText('Verification code')).toHaveFocus();
});

it('stays unfocused without autofocus', () => {
	render(CodeField, { props: { id: 'mfa-code', label: 'Verification code' } });
	expect(screen.getByLabelText('Verification code')).not.toHaveFocus();
});

it('reports the six-digit code once complete', async () => {
	const oncomplete = vi.fn();
	render(CodeField, { props: { id: 'mfa-code', label: 'Verification code', oncomplete } });
	const input = screen.getByLabelText('Verification code') as HTMLInputElement;

	await fireEvent.input(input, { target: { value: '482913' } });
	expect(input.value).toBe('482913');
	expect(oncomplete).toHaveBeenCalledWith('482913');
	expect(input).toHaveAttribute('autocomplete', 'one-time-code');
	expect(input).toHaveAttribute('inputmode', 'numeric');
});

it('ties a rejected code to the field', () => {
	render(CodeField, {
		props: { id: 'mfa-code', label: 'Verification code', error: "That code didn't match. Try the next one." }
	});
	const input = screen.getByLabelText('Verification code');
	expect(input).toBeInvalid();
	expect(input).toHaveAccessibleDescription("That code didn't match. Try the next one.");
});

it('reports a completed code once, however often the field rerenders, and again for a new code pasted over it', async () => {
	const oncomplete = vi.fn();
	const props = { id: 'mfa-code', label: 'Verification code', oncomplete };
	const { rerender } = render(CodeField, { props });
	const input = screen.getByLabelText('Verification code');

	await fireEvent.input(input, { target: { value: '482913' } });
	await rerender({ ...props, disabled: true });
	await rerender({ ...props, error: "That code didn't match. Try the next one." });
	expect(oncomplete).toHaveBeenCalledTimes(1);

	await fireEvent.input(input, { target: { value: '590174' } });
	expect(oncomplete).toHaveBeenNthCalledWith(2, '590174');
});
