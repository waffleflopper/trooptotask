// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SectionNav, type SectionNavCount } from './index.js';

function hrefs(scope: HTMLElement): (string | null)[] {
	return within(scope)
		.getAllByRole('link')
		.map((link) => link.getAttribute('href'));
}

afterEach(cleanup);

describe('patterns/section-nav SectionNav', () => {
	it('groups links under their labels, sets one apart and repeats them as narrow tabs', () => {
		render(SectionNav, {
			props: {
				label: 'Unit settings',
				groups: [
					{ label: 'Unit', items: [{ label: 'General', href: '/org/alpha/settings/general', active: true }] },
					{
						label: 'Access',
						items: [
							{
								label: 'Members',
								href: '/org/alpha/settings/members',
								count: { value: 2, label: '2 pending invitations' }
							},
							{
								label: 'Approvals',
								href: '/org/alpha/settings/approvals',
								count: { value: 0, label: '0 pending requests' }
							}
						]
					},
					{ label: 'Records', items: [{ label: 'Logs', href: '/org/alpha/settings/logs', tag: 'Owner' }] }
				],
				apart: { label: 'Danger zone', href: '/org/alpha/settings/danger', tag: 'Owner' }
			}
		});

		const [side, tabs] = screen.getAllByRole('navigation', { name: 'Unit settings' });
		expect(hrefs(within(side).getByRole('group', { name: 'Unit' }))).toEqual(['/org/alpha/settings/general']);
		expect(hrefs(within(side).getByRole('group', { name: 'Access' }))).toEqual([
			'/org/alpha/settings/members',
			'/org/alpha/settings/approvals'
		]);
		expect(within(side).getByRole('link', { name: 'General' }).getAttribute('aria-current')).toBe('page');
		expect(within(side).getByRole('link', { name: 'Members 2 pending invitations' })).toBeTruthy();
		expect(within(side).getByRole('link', { name: 'Approvals' })).toBeTruthy();
		expect(within(side).getByRole('link', { name: 'Logs Owner' })).toBeTruthy();
		expect(within(side).getByRole('link', { name: 'Danger zone Owner' }).closest('[role="group"]')).toBeNull();

		expect(hrefs(tabs)).toEqual([
			'/org/alpha/settings/general',
			'/org/alpha/settings/members',
			'/org/alpha/settings/approvals',
			'/org/alpha/settings/logs',
			'/org/alpha/settings/danger'
		]);
		expect(within(tabs).getByRole('link', { name: 'General' }).getAttribute('aria-current')).toBe('page');
		expect(within(tabs).getByRole('link', { name: 'Members 2 pending invitations' })).toBeTruthy();
		expect(within(tabs).getByRole('link', { name: 'Approvals' })).toBeTruthy();
		expect(within(tabs).getByRole('link', { name: 'Logs Owner' })).toBeTruthy();
		expect(within(tabs).getByRole('link', { name: 'Danger zone Owner' })).toBeTruthy();
	});

	it('announces a streamed count as loading, then its value, or unavailable when it fails', async () => {
		let resolveMembers!: (count: SectionNavCount) => void;
		render(SectionNav, {
			props: {
				label: 'Unit settings',
				groups: [
					{
						label: 'Access',
						items: [
							{
								label: 'Members',
								href: '/org/alpha/settings/members',
								count: new Promise<SectionNavCount>((resolve) => (resolveMembers = resolve))
							},
							{
								label: 'Approvals',
								href: '/org/alpha/settings/approvals',
								count: Promise.reject(new Error('Count failed'))
							}
						]
					}
				]
			}
		});

		const [side, tabs] = screen.getAllByRole('navigation', { name: 'Unit settings' });
		expect(within(side).getByRole('link', { name: 'Members count loading' })).toBeTruthy();
		expect(within(tabs).getByRole('link', { name: 'Members count loading' })).toBeTruthy();
		resolveMembers({ value: 1, label: '1 pending invitation' });

		expect(await within(side).findByRole('link', { name: 'Members 1 pending invitation' })).toBeTruthy();
		expect(await within(tabs).findByRole('link', { name: 'Members 1 pending invitation' })).toBeTruthy();
		expect(await within(side).findByRole('link', { name: 'Approvals count unavailable' })).toBeTruthy();
		expect(await within(tabs).findByRole('link', { name: 'Approvals count unavailable' })).toBeTruthy();
	});

	it('runs an in-place action and posts a form action, at every width', async () => {
		const openWhatsNew = vi.fn();
		render(SectionNav, {
			props: {
				label: 'Account',
				groups: [{ label: 'Account', items: [{ label: 'Profile', href: '/org/alpha/account/profile' }] }],
				actions: [
					{ label: "What's new", onclick: openWhatsNew },
					{ label: 'Sign out', action: '/auth/logout' }
				]
			}
		});

		const whatsNew = screen.getAllByRole('button', { name: "What's new" });
		expect(whatsNew).toHaveLength(2);
		for (const button of whatsNew) await fireEvent.click(button);
		expect(openWhatsNew).toHaveBeenCalledTimes(2);
		for (const signOut of screen.getAllByRole('button', { name: 'Sign out' })) {
			expect(signOut.getAttribute('type')).toBe('submit');
			expect(signOut.closest('form')?.getAttribute('method')).toBe('POST');
			expect(signOut.closest('form')?.getAttribute('action')).toBe('/auth/logout');
		}
	});
});
