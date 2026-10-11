// @vitest-environment happy-dom
import { render, screen, within } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import { RouteTabs } from './index.js';

describe('patterns/page-shell RouteTabs', () => {
	it('marks the active route, announces badge labels and leaves a disabled section unlinked', () => {
		render(RouteTabs, {
			props: {
				label: 'Organization settings sections',
				items: [
					{ label: 'General', href: '/org/alpha/settings/general', active: true },
					{
						label: 'Members',
						href: '/org/alpha/settings/members',
						badge: 2,
						badgeLabel: '2 pending invitations'
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
});
