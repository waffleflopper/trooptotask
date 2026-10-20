// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import { buildSettingsShell } from './settingsShell';
import SettingsShell from './SettingsShell.svelte';

const navigation = vi.hoisted(() => ({ navigating: { to: null as { url: URL } | null } }));
vi.mock('$app/paths', () => ({ resolve: (path: string) => path }));
vi.mock('$app/state', () => navigation);
afterEach(() => {
	cleanup();
	navigation.navigating.to = null;
});

const organization = { id: 'org-a', name: 'Synthetic Alpha', urlSlug: 'alpha', urlSegment: 'alpha' };
const children = createRawSnippet(() => ({ render: () => '<p>Settings content</p>' }));

function sideNav(): HTMLElement {
	return screen.getAllByRole('navigation', { name: 'Unit settings' })[0];
}

function groupHrefs(name: string): (string | null)[] {
	return within(within(sideNav()).getByRole('group', { name }))
		.getAllByRole('link')
		.map((link) => link.getAttribute('href'));
}

describe('Organization settings navigation', () => {
	it('groups the pages, badges pending invitations and marks owner-only pages for an owner', async () => {
		render(SettingsShell, {
			settingsShell: buildSettingsShell('owner', organization),
			navCounts: { pendingInvitations: Promise.resolve(2), pendingApprovals: Promise.resolve(0) },
			activePath: '/org/alpha/settings/policies',
			orgUrlSegment: 'org-a',
			children
		});

		expect(groupHrefs('Unit')).toEqual([
			'/org/alpha/settings/general',
			'/org/alpha/settings/policies',
			'/org/alpha/settings/ranks'
		]);
		expect(groupHrefs('Access')).toEqual(['/org/alpha/settings/members', '/org/alpha/settings/approvals']);
		expect(groupHrefs('Records')).toEqual([
			'/org/alpha/settings/archives',
			'/org/alpha/settings/exports',
			'/org/alpha/settings/logs'
		]);
		const nav = within(sideNav());
		expect(nav.getByRole('link', { name: 'Policies' })).toHaveAttribute('aria-current', 'page');
		expect(nav.getByRole('link', { name: 'Logs Owner' })).toHaveAttribute('href', '/org/alpha/settings/logs');
		expect(nav.getByRole('link', { name: 'Danger zone Owner' })).toHaveAttribute('href', '/org/alpha/settings/danger');
		expect(await nav.findByRole('link', { name: 'Members 2 pending invitations' })).toBeInTheDocument();
		expect(nav.getByRole('link', { name: 'Approvals' })).toBeInTheDocument();
		expect(nav.getByRole('link', { name: 'Archives' })).toBeInTheDocument();
		expect(screen.getByRole('status').textContent?.trim()).toBe('');
		expect(document.querySelector('[aria-busy]')).toBeNull();
		expect(document.title).toBe('Policies - Unit settings - Synthetic Alpha - Troop to Task');
	});

	it('hides Logs and Danger zone from an admin and links with the canonical segment', async () => {
		render(SettingsShell, {
			settingsShell: buildSettingsShell('admin', { ...organization, urlSlug: null, urlSegment: 'org-b' }),
			navCounts: { pendingInvitations: Promise.resolve(0), pendingApprovals: Promise.resolve(1) },
			activePath: '/org/org-b/settings',
			orgUrlSegment: 'wrong-segment',
			children
		});

		expect(groupHrefs('Records')).toEqual(['/org/org-b/settings/archives', '/org/org-b/settings/exports']);
		const nav = within(sideNav());
		expect(nav.queryByRole('link', { name: /Danger zone/ })).not.toBeInTheDocument();
		expect(nav.getByRole('link', { name: 'General' })).toHaveAttribute('aria-current', 'page');
		expect(await nav.findByRole('link', { name: 'Approvals 1 pending request' })).toBeInTheDocument();
		expect(nav.getByRole('link', { name: 'Members' })).toBeInTheDocument();
	});

	it('marks the content busy and announces the loading page while a navigation is pending', () => {
		navigation.navigating.to = { url: new URL('http://localhost/org/alpha/settings/members') };
		render(SettingsShell, {
			settingsShell: buildSettingsShell('owner', organization),
			navCounts: { pendingInvitations: Promise.resolve(1), pendingApprovals: Promise.resolve(1) },
			activePath: '/org/alpha/settings/general',
			orgUrlSegment: 'org-a',
			children
		});

		expect(screen.getByRole('status')).toHaveTextContent(/Members/);
		expect(screen.getByText('Settings content').closest('[aria-busy="true"]')).not.toBeNull();
		expect(screen.getByRole('status').closest('[aria-busy="true"]')).not.toBeNull();
	});
});
