// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import type { ActionResult } from '$app/forms';
import Page from './+page.svelte';

type EnhanceSubmit = (input: {
	formData: FormData;
	cancel: () => void;
}) => Promise<(outcome: { result: ActionResult; update: () => Promise<void> }) => Promise<void>>;
const { pageState, enhanceMock } = vi.hoisted(() => ({
	pageState: { status: 400 },
	enhanceMock: { implementation: null as null | ((node: HTMLFormElement, submit: EnhanceSubmit) => unknown) }
}));
vi.mock('$app/forms', () => ({
	enhance: (node: HTMLFormElement, submit: EnhanceSubmit) =>
		enhanceMock.implementation?.(node, submit) ?? { destroy: () => {} }
}));
vi.mock('$app/state', () => ({ page: pageState }));
afterEach(() => {
	cleanup();
	enhanceMock.implementation = null;
});

it('ties a server-rejected email to its field, including a native submission, and keeps a rate limit as a form alert', async () => {
	const view = render(Page, {
		props: { form: { error: 'Enter a valid email address', email: 'person@example' } }
	});
	const email = screen.getByLabelText(/^Email Address/);
	expect(email).toBeInvalid();
	expect(email).toHaveAccessibleDescription('Enter a valid email address');
	expect(email).toHaveValue('person@example');
	expect(screen.getAllByRole('alert').map((alert) => alert.textContent?.trim())).toEqual([
		'Enter a valid email address'
	]);

	pageState.status = 429;
	await view.rerender({ form: { error: 'Too many requests.', email: 'person@example' } });
	expect(email).toBeValid();
	expect(screen.getByRole('alert')).toHaveTextContent('Too many requests.');
});

it('moves focus to the confirmation once the reset link is sent', async () => {
	enhanceMock.implementation = (node, submit) => {
		node.addEventListener('submit', async (event) => {
			event.preventDefault();
			const finish = await submit({ formData: new FormData(node), cancel: () => {} });
			await finish({
				result: { type: 'success', status: 200, location: '/', data: {} },
				update: async () => {
					await view.rerender({ form: { success: true, email: 'person@example.com' } });
				}
			});
		});
		return { destroy: () => {} };
	};
	const view = render(Page, { props: { form: null } });
	await fireEvent.submit(screen.getByRole('button', { name: 'Send Reset Link' }).closest('form')!);

	await waitFor(() => expect(screen.getByRole('status')).toHaveFocus());
	expect(screen.getByRole('status')).toHaveTextContent('Check your email');
});

it('keeps the typed email and shows an alert when the request throws instead of replacing the page', async () => {
	const update = vi.fn();
	enhanceMock.implementation = (node, submit) => {
		node.addEventListener('submit', async (event) => {
			event.preventDefault();
			const finish = await submit({ formData: new FormData(node), cancel: () => {} });
			await finish({ result: { type: 'error', status: 500, error: { status: 500, message: 'boom' } }, update });
		});
		return { destroy: () => {} };
	};
	render(Page, { props: { form: null } });
	const email = screen.getByLabelText(/^Email Address/);
	await fireEvent.input(email, { target: { value: 'person@example.com' } });
	await fireEvent.submit(email.closest('form')!);

	expect(await screen.findByRole('alert')).toBeInTheDocument();
	expect(update).not.toHaveBeenCalled();
	expect(email).toHaveValue('person@example.com');
	await waitFor(() => expect(screen.getByRole('button', { name: 'Send Reset Link' })).toBeEnabled());
	await waitFor(() => expect(email).toHaveFocus());
});
