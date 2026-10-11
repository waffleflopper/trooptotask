// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import Page from './+page.svelte';

afterEach(() => {
	cleanup();
});

describe('suspended page contact', () => {
	it('titles the document', () => {
		render(Page);

		expect(document.title).toBe('Account Suspended - Troop to Task');
	});

	it('renders the canonical support mailbox', () => {
		render(Page);

		expect(screen.getByText('support@trooptotask.org')).toBeTruthy();
	});

	it("is the page's one main landmark", () => {
		render(Page);

		expect(screen.getAllByRole('main')).toHaveLength(1);
	});
});

it('lets a suspended user submit sign-out to the existing POST action', async () => {
	const { container } = render(Page);
	const submissions: { method: string; pathname: string }[] = [];
	container.addEventListener('submit', (event) => {
		event.preventDefault();
		const form = event.target as HTMLFormElement;
		submissions.push({ method: form.method.toLowerCase(), pathname: new URL(form.action).pathname });
	});

	await fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));

	expect(submissions).toEqual([{ method: 'post', pathname: '/auth/logout' }]);
});
