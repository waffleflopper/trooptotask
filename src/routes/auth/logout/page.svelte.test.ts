// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest';
import { afterEach, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/svelte';
import Page from './+page.svelte';

afterEach(cleanup);

it('announces failed sign-out and offers a native POST retry', () => {
	render(Page, { form: { error: 'Synthetic sign-out failure' } });
	expect(screen.getByRole('alert')).toHaveTextContent('Synthetic sign-out failure');
	const retry = screen.getByRole('button', { name: 'Try again' });
	expect(retry).toBeEnabled();
	expect(retry).toHaveAttribute('type', 'submit');
	const form = retry.closest('form')!;
	expect(form.method.toLowerCase()).toBe('post');
	expect(new URL(form.action).pathname).toBe('/auth/logout');
});
