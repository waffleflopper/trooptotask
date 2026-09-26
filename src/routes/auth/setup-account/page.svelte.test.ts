// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/svelte';
import Page from './+page.svelte';

vi.mock('$app/forms', () => ({ enhance: () => undefined }));
afterEach(cleanup);

it('allows a 72-character setup password but blocks a matching 73-character password before submission', async () => {
	render(Page, { data: { session: null, state: 'valid', email: 'synthetic@example.test' }, form: null });
	const password = screen.getByLabelText(/^Password/);
	const confirm = screen.getByLabelText(/^Confirm Password/);
	const submit = screen.getByRole('button', { name: 'Set Up Account' });
	const accepted = `Aa1${'x'.repeat(69)}`;
	await fireEvent.input(password, { target: { value: accepted } });
	await fireEvent.input(confirm, { target: { value: accepted } });
	expect(submit).toBeEnabled();
	const tooLong = `${accepted}x`;
	await fireEvent.input(password, { target: { value: tooLong } });
	await fireEvent.input(confirm, { target: { value: tooLong } });
	expect(submit).toBeDisabled();
	expect(screen.getByText('72 characters or fewer').closest('li')).toHaveTextContent('Needed: 72 characters or fewer');
});

it('offers an optional password-free status check on a fresh valid link without hiding normal setup', () => {
	render(Page, { data: { session: null, state: 'valid', email: 'synthetic@example.test' }, form: null });
	const setupForm = screen.getByRole('button', { name: 'Set Up Account' }).closest('form');
	const statusForm = screen.getByRole('button', { name: 'Check setup status' }).closest('form');
	expect(setupForm).toHaveAttribute('action', '?/complete');
	expect(statusForm).toHaveAttribute('action', '?/recover');
	expect(within(statusForm!).queryByLabelText(/^Password/)).not.toBeInTheDocument();
	expect(within(setupForm!).getByLabelText(/^Password/)).toBeInTheDocument();
});

it('offers a password-free status check after a held claim and keeps it available after reload', async () => {
	const page = render(Page, {
		data: { session: null, state: 'valid', email: 'synthetic@example.test' },
		form: { recoveryState: 'recovery-available', message: 'Check setup status to continue safely.' }
	});
	const statusForm = screen.getByRole('button', { name: 'Check setup status' }).closest('form');
	expect(statusForm).toHaveAttribute('action', '?/recover');
	expect(within(statusForm!).queryByLabelText(/^Password/)).not.toBeInTheDocument();
	expect(screen.queryByRole('button', { name: 'Set Up Account' })).not.toBeInTheDocument();

	await page.rerender({
		data: { session: null, state: 'recovery-available', email: 'synthetic@example.test' },
		form: null
	});
	expect(screen.getByRole('button', { name: 'Check setup status' })).toBeInTheDocument();
});

it('does not keep offering status checks if the link expires while an action response is in flight', () => {
	render(Page, {
		data: { session: null, state: 'expired', message: 'This Account Setup Link has expired.' },
		form: { recoveryState: 'recovery-available', message: 'Check setup status to continue safely.' }
	});
	expect(screen.queryByRole('button', { name: 'Check setup status' })).not.toBeInTheDocument();
	expect(screen.getByRole('link', { name: /Request a fresh setup link/i })).toHaveAttribute(
		'href',
		'/auth/renew-invite'
	);
});

it('shows the password form again only after a fenced attempt leaves this link valid', () => {
	render(Page, {
		data: { session: null, state: 'valid', email: 'synthetic@example.test' },
		form: { recoveryState: 'retry-password', message: 'You can choose a password with this link.' }
	});
	expect(screen.getByRole('button', { name: 'Set Up Account' }).closest('form')).toHaveAttribute(
		'action',
		'?/complete'
	);
	expect(screen.queryByRole('button', { name: 'Check setup status' })).not.toBeInTheDocument();
});

it('guides a recovered person to sign in or reset a password without requesting another write', () => {
	render(Page, {
		data: { session: null, state: 'recovered', message: 'Account setup is complete.' },
		form: null
	});
	expect(screen.getByRole('status')).toHaveTextContent('Account setup is complete.');
	expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/auth/login');
	expect(screen.getByRole('link', { name: 'Reset your password' })).toHaveAttribute('href', '/auth/forgot-password');
	expect(screen.queryByRole('button', { name: 'Set Up Account' })).not.toBeInTheDocument();
});

it('shows completed setup instead of a stale action error or another setup link', () => {
	render(Page, {
		data: { session: null, state: 'used', message: 'This setup link has already been used.' },
		form: { error: 'Too many setup attempts.', supportRequired: false }
	});
	expect(screen.getByRole('status')).toHaveTextContent('already been used');
	expect(screen.queryByRole('link', { name: /Request a fresh setup link/i })).not.toBeInTheDocument();
	expect(screen.getByRole('link', { name: 'Reset your password' })).toHaveAttribute('href', '/auth/forgot-password');
});

it('keeps the submission failure visible when claiming the link clears the setup session', async () => {
	const page = render(Page, { data: { session: null, state: 'valid', email: 'synthetic@example.test' }, form: null });
	const error = 'Choose a different password, then request a fresh setup link.';

	await page.rerender({
		data: { session: null, state: 'missing', message: 'This setup session has expired.' },
		form: { error, supportRequired: false }
	});

	const alert = screen.getByRole('alert');
	expect(alert).toHaveTextContent(error);
	expect(within(alert).getByRole('link', { name: /Request a fresh setup link/i })).toHaveAttribute(
		'href',
		'/auth/renew-invite'
	);
	expect(screen.queryByRole('button', { name: 'Set Up Account' })).not.toBeInTheDocument();
});

it('keeps staff recovery visible after an uncertain claim without offering a new link as the fix', async () => {
	const page = render(Page, { data: { session: null, state: 'valid', email: 'synthetic@example.test' }, form: null });
	await page.rerender({
		data: { session: null, state: 'missing', message: 'This setup session has expired.' },
		form: { error: 'Contact platform support. Give support request ID request-1.', supportRequired: true }
	});

	expect(screen.getByRole('alert')).toHaveTextContent('request ID request-1');
	expect(screen.queryByRole('link', { name: /Request a fresh setup link/i })).not.toBeInTheDocument();
	expect(screen.queryByRole('button', { name: 'Set Up Account' })).not.toBeInTheDocument();
});

it('keeps staff recovery guidance after reloading a cleared setup session', () => {
	render(Page, {
		data: {
			session: null,
			state: 'support-required',
			message: 'Contact platform support to resolve the previous setup attempt before trying another link.'
		},
		form: null
	});

	expect(screen.getByRole('heading', { name: 'Setup needs support' })).toBeInTheDocument();
	expect(screen.getByRole('alert')).toHaveTextContent('Contact platform support');
	expect(
		screen.getByText('A fresh setup link cannot finish while this attempt needs platform support.')
	).toBeInTheDocument();
	expect(
		screen.queryByText('Expired setup links can be renewed from the fresh-link request page.')
	).not.toBeInTheDocument();
	expect(screen.queryByRole('link', { name: /Request a fresh setup link/i })).not.toBeInTheDocument();
});

it('does not resubmit an uncertain claim when the loaded link still appears valid', async () => {
	render(Page, {
		data: { session: null, state: 'valid', email: 'synthetic@example.test' },
		form: { error: 'Contact platform support. Give support request ID request-2.', supportRequired: true }
	});

	expect(screen.getByRole('alert')).toHaveTextContent('request ID request-2');
	expect(screen.getByRole('heading', { name: 'Setup needs support' })).toBeInTheDocument();
	expect(screen.queryByRole('button', { name: 'Set Up Account' })).not.toBeInTheDocument();
	expect(screen.queryByRole('link', { name: /Request a fresh setup link/i })).not.toBeInTheDocument();
});
