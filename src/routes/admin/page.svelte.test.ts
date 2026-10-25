// @vitest-environment happy-dom
import { afterEach, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/svelte';
import Page from './+page.svelte';
import type { LayoutData } from './$types';

afterEach(cleanup);

it('links every visible section except the dashboard itself', () => {
	const visibleNavGroups = [
		{ label: null, items: [{ label: 'Dashboard', href: '/admin', page: 'dashboard' }] },
		{
			label: 'SUPPORT',
			items: [
				{ label: 'Users', href: '/admin/users', page: 'users' },
				{ label: 'Audit Log', href: '/admin/audit', page: 'audit' }
			]
		}
	] as LayoutData['visibleNavGroups'];
	render(Page, { props: { data: { visibleNavGroups } as never } });
	const links = within(screen.getByRole('navigation', { name: 'Admin sections' })).getAllByRole('link');
	expect(links.map((link) => link.getAttribute('href'))).toEqual(['/admin/users', '/admin/audit']);
	expect(links[0].textContent).toContain('Users');
	expect(links[1].textContent).toContain('Audit Log');
});
