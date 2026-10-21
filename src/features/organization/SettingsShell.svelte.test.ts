// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/svelte';
import { createRawSnippet, tick } from 'svelte';
import { buildSettingsShell } from './settingsShell';
import SettingsShell from './SettingsShell.svelte';

type Navigating = { to: { url: URL } | null };
const navigation = vi.hoisted(() => ({ current: { to: null } as Navigating }));
vi.mock('$app/paths', () => ({ resolve: (path: string) => path }));
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
		const view = render(SettingsShell, {
			settingsShell: buildSettingsShell('owner', organization),
			navCounts: { pendingInvitations: Promise.resolve(2), pendingApprovals: Promise.resolve(0) },
			activePath: '/org/alpha/settings/policies',
			orgUrlSegment: 'org-a',
			children
		});

		expect(groupHrefs('Unit')).toEqual([
			'/org/alpha/settings/general',
			'/org/alpha/settings/features',
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
		for (const part of ['Policies', 'Unit settings', 'Synthetic Alpha']) expect(document.title).toContain(part);

		await view.rerender({ activePath: '/org/alpha/settings/ranks' });
		expect(document.title).toContain('Ranks');
		expect(document.title).not.toContain('Policies');
		expect(document.title).toContain('Synthetic Alpha');
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

	function renderGeneral() {
		return render(SettingsShell, {
			settingsShell: buildSettingsShell('owner', organization),
			navCounts: { pendingInvitations: Promise.resolve(1), pendingApprovals: Promise.resolve(1) },
			activePath: '/org/alpha/settings/general',
			orgUrlSegment: 'org-a',
			children
		});
	}

	async function navigateTo(path: string | null) {
		navigating.to = path ? { url: new URL(`http://localhost${path}`) } : null;
		await tick();
	}

	it('shows the target page header over a skeleton once a settings navigation outlasts 150 ms', async () => {
		vi.useFakeTimers();
		renderGeneral();

		await navigateTo('/org/alpha/settings/archives');
		expect(screen.getByRole('status')).toHaveTextContent('Loading Archives...');
		await vi.advanceTimersByTimeAsync(149);
		expect(screen.getByText('Settings content')).toBeVisible();
		expect(screen.queryByRole('heading', { level: 1 })).toBeNull();

		await vi.advanceTimersByTimeAsync(1);
		expect(screen.getByRole('heading', { level: 1, name: 'Archives' })).toBeVisible();
		expect(screen.getByText('Unit settings · Owners and admins')).toBeVisible();
		expect(screen.getByText('Settings content')).not.toBeVisible();
		expect(screen.getByRole('status')).toHaveTextContent('Loading Archives...');

		await navigateTo(null);
		expect(screen.queryByRole('heading', { level: 1 })).toBeNull();
		expect(screen.getByText('Settings content')).toBeVisible();
		expect(screen.getByRole('status').textContent?.trim()).toBe('');
	});

	it('moves the nav highlight to the target as soon as a settings navigation starts', async () => {
		renderGeneral();
		const nav = within(sideNav());

		await navigateTo('/org/alpha/settings/members');
		expect(nav.getByRole('link', { name: /^Members/ })).toHaveAttribute('aria-current', 'page');
		expect(nav.getByRole('link', { name: 'General' })).not.toHaveAttribute('aria-current');

		await navigateTo('/org/alpha/personnel');
		expect(nav.getByRole('link', { name: 'General' })).toHaveAttribute('aria-current', 'page');
	});

	it('keeps the current page without a skeleton when a navigation settles within 150 ms', async () => {
		vi.useFakeTimers();
		renderGeneral();

		await navigateTo('/org/alpha/settings/members');
		await vi.advanceTimersByTimeAsync(120);
		await navigateTo(null);
		await vi.advanceTimersByTimeAsync(500);

		expect(screen.queryByRole('heading', { level: 1 })).toBeNull();
		expect(screen.getByText('Settings content')).toBeVisible();
	});
});
