// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/svelte';
import Page from './+page.svelte';

const { pageState } = vi.hoisted(() => ({ pageState: { status: 400 } }));
vi.mock('$app/forms', () => ({ enhance: () => ({ destroy: () => {} }) }));
vi.mock('$app/state', () => ({ page: pageState }));
afterEach(cleanup);

it('ties a server-rejected email to its field, including a native submission, and keeps a rate limit as a form alert', async () => {
	const view = render(Page, {
		props: {
			data: { session: null, email: '' },
			form: { error: 'Enter a valid email address', email: 'person@example' }
		}
	});
	const email = screen.getByLabelText(/^Email Address/);
	expect(email).toBeInvalid();
	expect(email).toHaveAccessibleDescription('Enter a valid email address');
	expect(email).toHaveValue('person@example');
	expect(screen.getAllByRole('alert').map((alert) => alert.textContent?.trim())).toEqual([
		'Enter a valid email address'
	]);

	pageState.status = 429;
	await view.rerender({
		data: { session: null, email: '' },
		form: { error: 'Too many requests.', email: 'person@example' }
	});
	expect(email).toBeValid();
	expect(screen.getByRole('alert')).toHaveTextContent('Too many requests.');
});
