// @vitest-environment happy-dom
import { render, screen, within } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import { Tabs, type RouteTabBadge } from './index.js';

describe('patterns/page-shell RouteTabs', () => {
	it('marks the active route, announces badge labels and leaves a disabled section unlinked', () => {
		render(Tabs, {
			props: {
				label: 'Organization settings sections',
				items: [
					{ label: 'General', href: '/org/alpha/settings/general', active: true },
					{
						label: 'Members',
						href: '/org/alpha/settings/members',
						badge: { value: 2, label: '2 pending invitations' }
					},
					{ label: 'Archives', href: '/org/alpha/settings/archives', disabled: true }
				]
			}
		});

		const nav = screen.getByRole('navigation', { name: 'Organization settings sections' });
		const general = within(nav).getByRole('link', { name: 'General' });
		const members = within(nav).getByRole('link', { name: 'Members 2 pending invitations' });

		expect(general.getAttribute('href')).toBe('/org/alpha/settings/general');
		expect(general.getAttribute('aria-current')).toBe('page');
		expect(members.getAttribute('href')).toBe('/org/alpha/settings/members');
		expect(members.getAttribute('aria-current')).toBeNull();
		expect(within(nav).getAllByRole('link')).toHaveLength(2);
		expect(within(nav).getByText('Archives').closest('[aria-disabled="true"]')).not.toBeNull();
	});

	it('announces a streamed badge as loading, then its count, or unavailable when it fails', async () => {
		let resolveLog!: (badge: RouteTabBadge | null) => void;
		render(Tabs, {
			props: {
				label: 'Personnel detail sections',
				items: [
					{
						label: 'Log',
						href: '/org/alpha/personnel/rivera/log',
						badge: new Promise<RouteTabBadge | null>((resolve) => (resolveLog = resolve))
					},
					{ label: 'Files', href: '/org/alpha/personnel/rivera/files', badge: Promise.resolve(null) },
					{
						label: 'Archived',
						href: '/org/alpha/personnel/rivera/archived',
						trailing: true,
						badge: Promise.reject(new Error('Count failed'))
					}
				]
			}
		});

		const nav = screen.getByRole('navigation', { name: 'Personnel detail sections' });
		expect(within(nav).getByRole('link', { name: 'Log count loading' })).toBeTruthy();
		resolveLog({ value: 3, label: '3 open follow-ups' });

		expect(await within(nav).findByRole('link', { name: 'Log 3 open follow-ups' })).toBeTruthy();
		expect(await within(nav).findByRole('link', { name: 'Files' })).toBeTruthy();
		expect(await within(nav).findByRole('link', { name: 'Archived count unavailable' })).toBeTruthy();
	});
});
