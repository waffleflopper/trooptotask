// @vitest-environment happy-dom
import { cleanup, render, screen, within } from '@testing-library/svelte';
import { createRawSnippet, tick } from 'svelte';
import { afterEach, expect, it, vi } from 'vitest';
import AccountShell from './AccountShell.svelte';

type Navigating = { to: { url: URL } | null };
const navigation = vi.hoisted(() => ({ current: { to: null } as Navigating }));
vi.mock('$app/state', () => ({
	get navigating() {
		return navigation.current;
	}
}));
const navigating = $state<Navigating>({ to: null });
navigation.current = navigating;

afterEach(() => {
	cleanup();
	vi.useRealTimers();
	navigating.to = null;
});

const children = createRawSnippet(() => ({ render: () => '<p>Page</p>' }));
// Every rendered Account navigation, whichever responsive variants are mounted, must offer the same sections.
const sections = () => {
	const navs = screen.getAllByRole('navigation', { name: 'Account' }).map((nav) =>
		within(nav)
			.getAllByRole('link')
			.map((link) => [link.textContent?.trim(), link.getAttribute('href'), link.getAttribute('aria-current')])
	);
	expect(new Set(navs.map((nav) => JSON.stringify(nav))).size).toBe(1);
	return navs[0];
};

it('offers an account with no Organization only its Profile and Sign-in & security', () => {
	render(AccountShell, { props: { baseHref: '/account', activePath: '/account/security', children } });
	const expected = [
		['Profile', '/account/profile', null],
		['Sign-in & security', '/account/security', 'page']
	];
	expect(sections()).toEqual(expected);
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
	expect(sections()).toEqual(expected);
});

it('covers the page with a skeleton when opening one feedback item outlasts 150 ms', async () => {
	vi.useFakeTimers();
	render(AccountShell, {
		props: { baseHref: '/org/alpha/account', activePath: '/org/alpha/account/notifications', children }
	});
	const feedbackLinks = () => screen.getAllByRole('link', { name: 'Feedback' });

	navigating.to = { url: new URL('http://localhost/org/alpha/account/feedback/f-1') };
	await tick();
	expect(screen.getByRole('status').textContent).not.toBe('');
	expect(new Set(feedbackLinks().map((link) => link.getAttribute('aria-current')))).toEqual(new Set(['page']));
	await vi.advanceTimersByTimeAsync(149);
	expect(screen.getByText('Page').closest('[hidden]')).toBeNull();

	await vi.advanceTimersByTimeAsync(1);
	expect(screen.getByText('Page').closest('[hidden]')).not.toBeNull();

	navigating.to = null;
	await tick();
	expect(screen.getByText('Page').closest('[hidden]')).toBeNull();
	expect(screen.getByRole('status').textContent).toBe('');
});
