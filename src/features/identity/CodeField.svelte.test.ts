// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import CodeField from './CodeField.svelte';

afterEach(cleanup);

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
