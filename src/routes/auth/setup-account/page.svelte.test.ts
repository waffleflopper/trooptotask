// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/svelte';
import Page from './+page.svelte';

vi.mock('$app/forms', () => ({ enhance: () => undefined }));
afterEach(cleanup);

it('keeps the submission failure visible when claiming the link clears the setup session', async () => {
	const page = render(Page, { data: { session: null, state: 'valid', email: 'synthetic@example.test' }, form: null });
	const error = 'Choose a different password, then request a fresh setup link.';

	await page.rerender({
		data: { session: null, state: 'missing', message: 'This setup session has expired.' },
		form: { error }
	});

	const alert = screen.getByRole('alert');
	expect(alert).toHaveTextContent(error);
	expect(within(alert).getByRole('link', { name: /Request a fresh setup link/i })).toHaveAttribute(
		'href',
		'/auth/renew-invite'
	);
	expect(screen.queryByRole('button', { name: 'Set Up Account' })).not.toBeInTheDocument();
});
