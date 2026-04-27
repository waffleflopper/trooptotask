// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('$app/stores', () => ({
	page: {
		subscribe(run: (value: { params: { orgId: string }; url: URL }) => void) {
			run({
				params: { orgId: 'org-1' },
				url: new URL('http://localhost/org/org-1/settings/archived')
			});
			return () => {};
		}
	}
}));

import SettingsLayoutTest from './SettingsLayoutTest.svelte';

describe('settings layout toolbar', () => {
	afterEach(() => {
		cleanup();
	});

	it('keeps organization governance sections behind settings navigation with the current section marked active', () => {
		render(SettingsLayoutTest);

		const nav = screen.getByRole('navigation', { name: 'Organization settings sections' });
		const archived = screen.getByRole('link', { name: 'Archived Personnel' });

		expect(nav.contains(archived)).toBe(true);
		expect(screen.getByRole('link', { name: 'Overview' }).getAttribute('href')).toBe('/org/org-1/settings');
		expect(screen.getByRole('link', { name: 'Approvals' }).getAttribute('href')).toBe('/org/org-1/settings/approvals');
		expect(archived.getAttribute('href')).toBe('/org/org-1/settings/archived');
		expect(screen.getByRole('link', { name: 'Audit Log' }).getAttribute('href')).toBe('/org/org-1/settings/audit');
		expect(screen.getByRole('link', { name: 'Policies' }).getAttribute('href')).toBe('/org/org-1/settings/policies');
		expect(archived.getAttribute('aria-current')).toBe('page');
		expect(screen.queryByRole('button', { name: 'Archived Personnel' })).toBeNull();
	});

	it('keeps non-governance users on the settings overview only', () => {
		render(SettingsLayoutTest, { props: { canAccessOrganizationGovernance: false } });

		expect(screen.getByRole('link', { name: 'Overview' }).getAttribute('href')).toBe('/org/org-1/settings');
		expect(screen.queryByRole('link', { name: 'Approvals' })).toBeNull();
		expect(screen.queryByRole('link', { name: 'Archived Personnel' })).toBeNull();
		expect(screen.queryByRole('link', { name: 'Audit Log' })).toBeNull();
		expect(screen.queryByRole('link', { name: 'Policies' })).toBeNull();
	});
});
