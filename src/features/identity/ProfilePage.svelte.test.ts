// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ActionResult } from '@sveltejs/kit';
import ProfilePage from './ProfilePage.svelte';
import type { SignedInAccount } from './contracts';

type Finish = (input: { result: ActionResult; update: (options?: { reset?: boolean }) => Promise<void> }) => unknown;

const transport = vi.hoisted(() => ({
	result: null as ActionResult | Promise<ActionResult> | null,
	sent: 0,
	update: vi.fn(async () => {})
}));

vi.mock('$app/forms', () => ({
	enhance: (form: HTMLFormElement, submit?: (input: { formData: FormData; cancel: () => void }) => Finish | void) => {
		const onSubmit = async (event: Event) => {
			event.preventDefault();
			let cancelled = false;
			const finish = submit?.({ formData: new FormData(form), cancel: () => (cancelled = true) });
			if (cancelled || !finish || !transport.result) return;
			transport.sent += 1;
			await finish({ result: await transport.result, update: transport.update });
		};
		form.addEventListener('submit', onSubmit);
		return { destroy: () => form.removeEventListener('submit', onSubmit) };
	}
}));

afterEach(() => {
	cleanup();
	transport.result = null;
	transport.sent = 0;
	vi.clearAllMocks();
});

const SAVED: SignedInAccount = {
	email: 'emma@example.test',
	profile: { status: 'loaded', profile: { firstName: 'Emma', lastName: 'Hayes', rank: 'SGT' } }
};

function renderPage(
	options: { account?: SignedInAccount; role?: 'owner' | 'admin' | 'member'; onleave?: () => void } = {}
) {
	return render(ProfilePage, {
		props: {
			account: options.account ?? SAVED,
			ranks: ['CPT', 'SGT', 'SFC'],
			form: null,
			securityHref: '/org/alpha/account/security',
			unit: { name: 'Alpha Company', role: options.role ?? 'member' },
			onretry: vi.fn(),
			onleave: options.onleave
		}
	});
}

describe('account profile page', () => {
	it('offers the account ranks in order with the saved rank selected', async () => {
		renderPage();
		expect(screen.getByText('SGT Emma Hayes')).toBeTruthy();
		await fireEvent.click(screen.getByRole('button', { name: 'Edit name and rank' }));

		const rank = screen.getByLabelText('Rank') as HTMLSelectElement;
		expect(rank).toHaveAttribute('aria-required', 'true');
		expect([...rank.options].map((option) => option.textContent)).toEqual(['Rank', 'CPT', 'SGT', 'SFC']);
		expect(rank.value).toBe('SGT');
		await waitFor(() => expect(rank).toHaveFocus());
	});

	it('flags an empty rank without saving, and clears it once a rank is chosen', async () => {
		transport.result = { type: 'success', status: 200 };
		renderPage({ account: { email: null, profile: { status: 'loaded', profile: null } } });
		await fireEvent.click(screen.getByRole('button', { name: 'Add name and rank' }));
		const rank = screen.getByLabelText('Rank') as HTMLSelectElement;

		await fireEvent.submit(rank.form!);
		expect(rank).toHaveAttribute('aria-invalid', 'true');
		expect(rank).toHaveAccessibleDescription('Select a rank.');
		expect(transport.update).not.toHaveBeenCalled();

		await fireEvent.change(rank, { target: { value: 'SGT' } });
		expect(rank).not.toHaveAttribute('aria-invalid');
	});

	it('keeps the draft open after a failed save', async () => {
		transport.result = { type: 'failure', status: 400, data: { error: 'First and last name are required.' } };
		renderPage();
		await fireEvent.click(screen.getByRole('button', { name: 'Edit name and rank' }));
		await fireEvent.input(screen.getByLabelText('First name'), { target: { value: 'Emily' } });

		await fireEvent.submit(screen.getByLabelText('First name').closest('form')!);
		await waitFor(() => expect(transport.update).toHaveBeenCalledWith({ reset: false }));
		expect(screen.getByLabelText('First name')).toHaveValue('Emily');
		expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
	});

	it('sends one save at a time and holds the draft read-only until it answers', async () => {
		let answer!: (result: ActionResult) => void;
		transport.result = new Promise((resolve) => (answer = resolve));
		renderPage();
		await fireEvent.click(screen.getByRole('button', { name: 'Edit name and rank' }));
		const firstName = screen.getByLabelText('First name');
		await fireEvent.input(firstName, { target: { value: 'Emily' } });

		await fireEvent.submit(firstName.closest('form')!);
		await fireEvent.submit(firstName.closest('form')!);
		expect(transport.sent).toBe(1);
		expect(firstName).toBeDisabled();
		expect(screen.getByLabelText('Rank')).toBeDisabled();
		expect(screen.getByRole('button', { name: /Saving/ })).toBeDisabled();

		answer({ type: 'failure', status: 503, data: { error: 'Unable to save your profile.' } });
		await waitFor(() => expect(firstName).toBeEnabled());
		expect(firstName).toHaveValue('Emily');
		await waitFor(() => expect(screen.getByLabelText('Rank')).toHaveFocus());
	});

	it('closes the editor after a successful save and returns focus to Edit', async () => {
		transport.result = { type: 'success', status: 200 };
		renderPage();
		await fireEvent.click(screen.getByRole('button', { name: 'Edit name and rank' }));

		await fireEvent.submit(screen.getByLabelText('First name').closest('form')!);
		await waitFor(() => expect(screen.getByRole('button', { name: 'Edit name and rank' })).toHaveFocus());
		expect(screen.queryByLabelText('First name')).toBeNull();
	});

	it('offers Leave unit only when the page wires a leave action', async () => {
		const onleave = vi.fn();
		renderPage({ onleave });
		expect(screen.getByText('Alpha Company · Member · kept by unit admins')).toBeTruthy();
		await fireEvent.click(screen.getByRole('button', { name: 'Leave unit' }));
		expect(onleave).toHaveBeenCalledOnce();

		cleanup();
		renderPage({ role: 'owner' });
		expect(screen.queryByRole('button', { name: 'Leave unit' })).toBeNull();
	});

	it('offers a retry when the name could not be read, instead of an empty editor', async () => {
		const onretry = vi.fn();
		render(ProfilePage, {
			props: {
				account: { email: 'emma@example.test', profile: { status: 'unavailable' } },
				ranks: ['SGT'],
				form: null,
				securityHref: '/org/alpha/account/security',
				unit: { name: 'Alpha Company', role: 'member' },
				onretry
			}
		});
		expect(screen.getByText('Your name could not be loaded')).toBeTruthy();
		expect(screen.queryByRole('button', { name: /name and rank/ })).toBeNull();
		await fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
		expect(onretry).toHaveBeenCalledOnce();
	});

	it('links the email row to Sign-in & security', () => {
		renderPage();
		expect(screen.getByRole('link', { name: /Change in Sign-in & security/ })).toHaveAttribute(
			'href',
			'/org/alpha/account/security'
		);
	});
});
