// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import type { ActionResult, SubmitFunction } from '@sveltejs/kit';
import Page from './+page.svelte';

const transport = vi.hoisted(() => ({ result: undefined as unknown, update: undefined as unknown }));
// Exercise the component's real enhancement callback; only SvelteKit's request transport is replaced.
vi.mock('$app/forms', () => ({
	enhance: (node: HTMLFormElement, submit: SubmitFunction) => {
		const listener = async (event: Event) => {
			event.preventDefault();
			const callback = await submit({
				formElement: node,
				formData: new FormData(),
				action: new URL('https://app.invalid/'),
				controller: new AbortController(),
				cancel: () => {},
				submitter: null
			});
			await callback?.({
				result: transport.result as ActionResult,
				update: transport.update as () => Promise<void>,
				formElement: node,
				formData: new FormData(),
				action: new URL('https://app.invalid/')
			});
		};
		node.addEventListener('submit', listener);
		return { destroy: () => node.removeEventListener('submit', listener) };
	}
}));
afterEach(cleanup);

it('ties an invalid email to its field and keeps a rate limit as a form alert', async () => {
	transport.update = vi.fn().mockResolvedValue(undefined);
	const view = render(Page, { props: { data: { session: null, email: '' }, form: null } });
	const email = screen.getByLabelText(/^Email Address/);
	await fireEvent.input(email, { target: { value: 'person@example' } });

	transport.result = {
		type: 'failure',
		status: 400,
		data: { error: 'Enter a valid email address', email: 'person@example' }
	};
	await fireEvent.submit(email.closest('form')!);
	await waitFor(() => expect(email).toBeInvalid());
	expect(email).toHaveAccessibleDescription('Enter a valid email address');
	expect(email).toHaveValue('person@example');

	transport.result = { type: 'failure', status: 429, data: { error: 'Too many requests.', email: 'person@example' } };
	await view.rerender({
		data: { session: null, email: '' },
		form: { error: 'Too many requests.', email: 'person@example' }
	});
	await fireEvent.submit(email.closest('form')!);
	await waitFor(() => expect(email).toBeValid());
	expect(screen.getByRole('alert')).toHaveTextContent('Too many requests.');
});
