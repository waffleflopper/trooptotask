// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/svelte';
import type { Window as HappyDOMWindow } from 'happy-dom';
import { createRawSnippet, tick } from 'svelte';
import VisibleStub from '$lib/test-stubs/VisibleStub.svelte';

const navigation = vi.hoisted(() => ({
	before: [] as Array<(navigation: { type: string; to: { url: URL } | null }) => void>,
	after: [] as Array<() => void>,
	pathname: '/admin/people'
}));

vi.mock('$app/state', () => ({
	page: {
		get url() {
			return new URL(`http://localhost${navigation.pathname}`);
		}
	}
}));

vi.mock('$app/navigation', () => ({
	beforeNavigate: (callback: (navigation: { type: string; to: { url: URL } | null }) => void) =>
		navigation.before.push(callback),
	afterNavigate: (callback: () => void) => navigation.after.push(callback)
}));

vi.mock('$features/platform-admin/components/AdminSearch.svelte', () => ({
	default: VisibleStub
}));

import Layout from './+layout.svelte';

afterEach(() => {
	cleanup();
	navigation.before.length = 0;
	navigation.after.length = 0;
	navigation.pathname = '/admin/people';
	document.body.innerHTML = '';
	(window as unknown as HappyDOMWindow).happyDOM.setViewport({ width: 1024, height: 768 });
});

// Mirrors a browser link choice under SvelteKit: the link's own handlers run, pending work settles before the
// document listener's beforeNavigate, and focus resets to the body before afterNavigate.
function routeLinkClicks() {
	let navigated = Promise.resolve();
	const route = (event: MouseEvent) => {
		const link = (event.target as Element).closest('a');
		if (!link) return;
		event.preventDefault();
		navigated = new Promise((resolve) => setTimeout(resolve, 0))
			.then(() => navigation.before.forEach((callback) => callback({ type: 'link', to: { url: new URL(link.href) } })))
			.then(() => new Promise((resolve) => setTimeout(resolve, 50)))
			.then(() => {
				document.body.tabIndex = -1;
				document.body.focus();
				navigation.after.forEach((callback) => callback());
			});
	};
	document.addEventListener('click', route);
	return async () => {
		document.removeEventListener('click', route);
		await navigated;
	};
}

const children = createRawSnippet(() => ({
	render: () => '<section>Admin child</section>'
}));

function renderLayout(inboxOpenCount: Promise<number | null> = Promise.resolve(0)) {
	return render(Layout, {
		props: {
			children,
			data: { viewer: null, adminUserId: 'admin-1', adminEmail: 'admin@example.test', inboxOpenCount }
		}
	});
}

describe('admin layout', () => {
	it('renders one main landmark around page content, apart from the admin header', () => {
		renderLayout();

		expect(screen.getAllByRole('main')).toHaveLength(1);
		expect(screen.getByRole('main').textContent).toBe('Admin child');
	});

	it('shows global admin search', () => {
		renderLayout();

		expect(screen.getAllByTestId('visible-stub')).toHaveLength(1);
	});

	it('lists the five sections in order and marks only the current one', () => {
		renderLayout();

		const nav = screen.getByRole('navigation', { name: 'Platform admin' });
		const links = within(nav).getAllByRole('link');
		expect(links.map((link) => [link.textContent?.trim(), link.getAttribute('href')])).toEqual([
			['Inbox', '/admin'],
			['Organizations', '/admin/organizations'],
			['People', '/admin/people'],
			['Activity', '/admin/activity'],
			['Announcements', '/admin/announcements']
		]);
		const current = links.filter((link) => link.getAttribute('aria-current') === 'page');
		expect(current.map((link) => link.textContent?.trim())).toEqual(['People']);
	});

	it('marks Inbox current on the Inbox home', () => {
		navigation.pathname = '/admin';
		renderLayout();

		const nav = screen.getByRole('navigation', { name: 'Platform admin' });
		expect(within(nav).getByRole('link', { name: 'Inbox' }).getAttribute('aria-current')).toBe('page');
		expect(within(nav).getByRole('link', { name: 'People' }).hasAttribute('aria-current')).toBe(false);
	});

	it('shows the operator as static text with a way back to the app', () => {
		renderLayout();

		expect(screen.getByText('Operator · MFA on').closest('button, a, [tabindex]')).toBeNull();
		expect(screen.getByText('admin@example.test').closest('button, a, [tabindex]')).toBeNull();
		expect(screen.getByRole('link', { name: /Back to the app/ }).getAttribute('href')).toBe('/dashboard');
	});

	it('counts open Inbox items on the Inbox link once the count arrives', async () => {
		renderLayout(Promise.resolve(7));

		const nav = screen.getByRole('navigation', { name: 'Platform admin' });
		expect(await within(nav).findByRole('link', { name: 'Inbox 7 open' })).toBeTruthy();
	});

	it.each([0, null])('leaves the Inbox link bare when the count is %s', async (count) => {
		const pending = Promise.resolve(count);
		renderLayout(pending);
		await pending;
		await tick();

		const nav = screen.getByRole('navigation', { name: 'Platform admin' });
		expect(within(nav).getByRole('link', { name: 'Inbox' })).toBeTruthy();
	});

	it('returns focus to Menu after a link choice in the phone menu', async () => {
		(window as unknown as HappyDOMWindow).happyDOM.setViewport({ width: 390, height: 844 });
		renderLayout();
		const stopRouting = routeLinkClicks();
		const trigger = screen.getByRole('button', { name: 'Menu' });
		trigger.focus();
		await fireEvent.click(trigger);
		expect(trigger.getAttribute('aria-expanded')).toBe('true');
		const menu = document.getElementById('admin-menu') as HTMLElement;
		const link = within(menu).getByRole('link', { name: 'People' });
		link.focus();
		await fireEvent.click(link);
		await stopRouting();

		expect(document.getElementById('admin-menu')).toBeNull();
		expect(document.activeElement).toBe(trigger);
	});

	it('closes the phone menu on Escape and returns focus to Menu', async () => {
		(window as unknown as HappyDOMWindow).happyDOM.setViewport({ width: 390, height: 844 });
		renderLayout();
		const trigger = screen.getByRole('button', { name: 'Menu' });
		await fireEvent.click(trigger);
		within(document.getElementById('admin-menu') as HTMLElement)
			.getByRole('link', { name: 'People' })
			.focus();
		await fireEvent.keyDown(window, { key: 'Escape' });

		expect(document.getElementById('admin-menu')).toBeNull();
		expect(trigger.getAttribute('aria-expanded')).toBe('false');
		expect(document.activeElement).toBe(trigger);
	});

	it('leaves the page focus reset alone after a desktop link choice', async () => {
		renderLayout();
		const stopRouting = routeLinkClicks();
		const nav = screen.getByRole('navigation', { name: 'Platform admin' });
		const link = within(nav).getByRole('link', { name: 'People' });
		link.focus();
		await fireEvent.click(link);
		await stopRouting();

		expect(document.activeElement).toBe(document.body);
	});
});
