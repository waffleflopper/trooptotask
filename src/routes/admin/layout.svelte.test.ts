// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/svelte';
import type { Window as HappyDOMWindow } from 'happy-dom';
import { createRawSnippet } from 'svelte';
import VisibleStub from '$lib/test-stubs/VisibleStub.svelte';

const navigation = vi.hoisted(() => ({
	before: [] as Array<(navigation: { type: string; to: { url: URL } | null }) => void>,
	after: [] as Array<() => void>,
	pathname: '/admin/users'
}));

vi.mock('$app/stores', () => ({
	page: {
		subscribe: (run: (value: { url: URL }) => void) => {
			run({ url: new URL(`http://localhost${navigation.pathname}`) });
			return () => {};
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
	navigation.pathname = '/admin/users';
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

function renderLayout() {
	return render(Layout, {
		props: {
			children,
			data: { viewer: null, adminUserId: 'admin-1', adminEmail: 'admin@example.test' }
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

	it('shows the admin identity as static text rather than controls without an action', () => {
		renderLayout();

		expect(screen.getByText('Control Room').closest('button, a, [tabindex]')).toBeNull();
		expect(screen.getByText('admin@example.test').closest('button, a, [tabindex]')).toBeNull();
		expect(screen.queryByRole('button', { name: /Platform Admin|admin@example.test/ })).toBeNull();
	});

	it('returns focus to Toggle Sidebar after a link choice in the phone sidebar', async () => {
		(window as unknown as HappyDOMWindow).happyDOM.setViewport({ width: 390, height: 844 });
		renderLayout();
		const stopRouting = routeLinkClicks();
		const trigger = screen.getAllByRole('button', { name: 'Toggle Sidebar' })[0];
		trigger.focus();
		await fireEvent.click(trigger);
		const link = within(screen.getByRole('dialog')).getByRole('link', { name: 'People' });
		link.focus();
		await fireEvent.click(link);
		await stopRouting();

		expect(screen.queryByRole('dialog')).toBeNull();
		expect(document.activeElement?.getAttribute('data-sidebar')).toBe('trigger');
	});

	it('leaves the page focus reset alone after a desktop link choice', async () => {
		renderLayout();
		const stopRouting = routeLinkClicks();
		const link = screen.getByRole('link', { name: 'People' });
		link.focus();
		await fireEvent.click(link);
		await stopRouting();

		expect(document.activeElement).toBe(document.body);
	});
});
