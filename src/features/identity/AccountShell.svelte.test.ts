// @vitest-environment happy-dom
import { cleanup, render, screen, within } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import { afterEach, expect, it, vi } from 'vitest';
import AccountShell from './AccountShell.svelte';

vi.mock('$app/state', () => ({ navigating: { to: null } }));

afterEach(cleanup);

const children = createRawSnippet(() => ({ render: () => '<p>Page</p>' }));
// The wide sidebar and the narrow tabs both carry the sections.
const sections = () =>
	screen.getAllByRole('navigation', { name: 'Account' }).map((nav) =>
		within(nav)
			.getAllByRole('link')
			.map((link) => [link.textContent?.trim(), link.getAttribute('href'), link.getAttribute('aria-current')])
	);

it('offers an account with no Organization only its Profile and Sign-in & security', () => {
	render(AccountShell, { props: { baseHref: '/account', activePath: '/account/security', children } });
	const expected = [
		['Profile', '/account/profile', null],
		['Sign-in & security', '/account/security', 'page']
	];
	expect(sections()).toEqual([expected, expected]);
});

it('keeps Feedback current in the Organization shell while one feedback item is open', () => {
	render(AccountShell, {
		props: { baseHref: '/org/alpha/account', activePath: '/org/alpha/account/feedback/f-1', children }
	});
	const expected = [
		['Profile', '/org/alpha/account/profile', null],
		['Sign-in & security', '/org/alpha/account/security', null],
		['Notifications', '/org/alpha/account/notifications', null],
		['Feedback', '/org/alpha/account/feedback', 'page']
	];
	expect(sections()).toEqual([expected, expected]);
});
