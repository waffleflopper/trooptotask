// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import VisibleStub from '$lib/test-stubs/VisibleStub.svelte';

const navigation = vi.hoisted(() => ({
	before: [] as Array<(navigation: { type: string }) => void>,
	after: [] as Array<() => void>
}));

vi.mock('$app/stores', async () => {
	const { readable } = await import('svelte/store');

	return {
		page: readable({
			url: new URL('http://localhost/admin/users')
		})
	};
});

vi.mock('$app/navigation', () => ({
	beforeNavigate: (callback: (navigation: { type: string }) => void) => navigation.before.push(callback),
	afterNavigate: (callback: () => void) => navigation.after.push(callback)
}));

vi.mock('$features/platform-admin/components/AdminSearch.svelte', () => ({
	default: VisibleStub
}));

import Layout from './+layout.svelte';
import type { LayoutData } from './$types';

afterEach(() => {
	cleanup();
	navigation.before.length = 0;
	navigation.after.length = 0;
	document.body.innerHTML = '';
});

const children = createRawSnippet(() => ({
	render: () => '<section>Admin child</section>'
}));

const supportGroups: LayoutData['visibleNavGroups'] = [
	{ label: null, items: [{ label: 'Dashboard', href: '/admin', page: 'dashboard' }] },
	{
		label: 'SUPPORT',
		items: [
			{ label: 'Users', href: '/admin/users', page: 'users' },
			{ label: 'Organizations', href: '/admin/organizations', page: 'organizations' }
		]
	}
] as LayoutData['visibleNavGroups'];

function renderLayout(
	accessiblePages: LayoutData['accessiblePages'],
	visibleNavGroups: LayoutData['visibleNavGroups'] = [
		{ label: null, items: [{ label: 'Dashboard', href: '/admin', page: 'dashboard' }] }
	] as LayoutData['visibleNavGroups']
) {
	return render(Layout, {
		props: {
			children,
			data: {
				session: null,
				adminUserId: 'admin-1',
				adminEmail: 'admin@example.test',
				adminRole: 'billing',
				accessiblePages,
				visibleNavGroups
			}
		}
	});
}

describe('admin layout', () => {
	it('hides global admin search when the admin cannot access users or organizations', () => {
		renderLayout(['dashboard']);

		expect(screen.queryByTestId('visible-stub')).toBeNull();
	});

	it('shows global admin search when the admin can access support search targets', () => {
		renderLayout(['dashboard', 'users', 'organizations']);

		expect(screen.getAllByTestId('visible-stub')).toHaveLength(1);
	});

	it('names the admin navigation and marks only the current page link', () => {
		renderLayout(['dashboard', 'users', 'organizations'], supportGroups);

		const nav = screen.getByRole('navigation', { name: 'Platform admin' });
		const support = within(nav).getByRole('list', { name: 'SUPPORT' });
		expect(within(support).getByRole('link', { name: 'Users' }).getAttribute('aria-current')).toBe('page');
		expect(within(support).getByRole('link', { name: 'Organizations' }).hasAttribute('aria-current')).toBe(false);
		expect(within(nav).getByRole('link', { name: 'Dashboard' }).hasAttribute('aria-current')).toBe(false);
	});

	it('shows the admin identity as static text rather than controls without an action', () => {
		renderLayout(['dashboard']);

		expect(screen.getByText('Control Room').closest('button, a, [tabindex]')).toBeNull();
		expect(screen.getByText('admin@example.test').closest('button, a, [tabindex]')).toBeNull();
		expect(screen.queryByRole('button', { name: /Platform Admin|admin@example.test/ })).toBeNull();
	});

	it('returns focus to Toggle Sidebar after a link choice in the phone sidebar', () => {
		renderLayout(['dashboard']);
		const sheet = document.createElement('div');
		sheet.dataset.sidebar = 'sidebar';
		sheet.dataset.mobile = 'true';
		const link = document.createElement('a');
		link.href = '/admin/users';
		sheet.append(link);
		document.body.append(sheet);
		link.focus();

		navigation.before.forEach((callback) => callback({ type: 'link' }));
		sheet.remove();
		navigation.after.forEach((callback) => callback());

		expect(document.activeElement?.getAttribute('data-sidebar')).toBe('trigger');
		expect(document.activeElement?.textContent?.trim()).toBe('Toggle Sidebar');
	});

	it('leaves focus alone after a desktop link choice', () => {
		renderLayout(['dashboard']);
		const link = screen.getByRole('link', { name: 'Dashboard' });
		link.focus();

		navigation.before.forEach((callback) => callback({ type: 'link' }));
		navigation.after.forEach((callback) => callback());

		expect(document.activeElement).toBe(link);
	});
});
