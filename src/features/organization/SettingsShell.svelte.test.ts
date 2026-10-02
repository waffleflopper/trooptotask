// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import { buildSettingsShell } from './settingsShell';
import SettingsShell from './SettingsShell.svelte';

vi.mock('$app/paths', () => ({ resolve: (path: string) => path }));
afterEach(cleanup);

describe('Organization settings navigation', () => {
	it('keeps canonical links, positive badges and the active section when moving from owner to admin access', async () => {
		const organization = { id: 'org-a', name: 'Synthetic Alpha', urlSlug: 'alpha', urlSegment: 'alpha' };
		const counts = { pendingInvitationsCount: 2, archivedPersonnelCount: 3, pendingApprovalsCount: 4 };
		const children = createRawSnippet(() => ({ render: () => '<p>Settings content</p>' }));
		const view = render(SettingsShell, {
			settingsShell: buildSettingsShell('owner', organization, counts),
			activePath: '/org/alpha/settings/policies',
			orgUrlSegment: 'org-a',
			children
		});
		expect(screen.getByRole('link', { name: 'Policies' })).toHaveAttribute('href', '/org/alpha/settings/policies');
		expect(screen.getByRole('link', { name: 'Policies' })).toHaveAttribute('aria-current', 'page');
		expect(screen.getByRole('link', { name: 'Members 2' })).toHaveAttribute('href', '/org/alpha/settings/members');
		expect(screen.getByRole('link', { name: 'Archives 3' })).toHaveAttribute('href', '/org/alpha/settings/archives');
		expect(screen.getByRole('link', { name: 'Approvals 4' })).toHaveAttribute('href', '/org/alpha/settings/approvals');
		expect(screen.getByRole('link', { name: 'Logs' })).toHaveAttribute('href', '/org/alpha/settings/logs');
		expect(screen.getByRole('link', { name: 'Danger' })).toHaveAttribute('href', '/org/alpha/settings/danger');
		await view.rerender({
			settingsShell: buildSettingsShell(
				'admin',
				{ ...organization, id: 'org-b', name: 'Synthetic Bravo', urlSlug: null, urlSegment: 'org-b' },
				{ pendingInvitationsCount: 0, archivedPersonnelCount: 0, pendingApprovalsCount: 0 }
			),
			activePath: '/org/org-b/settings',
			orgUrlSegment: 'wrong-segment',
			children
		});
		expect(screen.queryByRole('link', { name: 'Logs' })).not.toBeInTheDocument();
		expect(screen.queryByRole('link', { name: 'Danger' })).not.toBeInTheDocument();
		expect(screen.getByRole('link', { name: 'General' })).toHaveAttribute('href', '/org/org-b/settings/general');
		expect(screen.getByRole('link', { name: 'General' })).toHaveAttribute('aria-current', 'page');
		expect(screen.getByRole('link', { name: 'Members' })).toHaveAttribute('href', '/org/org-b/settings/members');
		expect(screen.getByRole('link', { name: 'Archives' })).not.toHaveAttribute('aria-current');
	});
});
