// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('$app/stores', () => ({
	page: {
		subscribe(run: (value: { params: { orgId: string }; url: URL }) => void) {
			run({
				params: { orgId: 'org-1' },
				url: new URL('http://localhost/org/org-1/admin/archived')
			});
			return () => {};
		}
	}
}));

import AdminLayoutTest from './AdminLayoutTest.svelte';

describe('admin layout toolbar', () => {
	afterEach(() => {
		cleanup();
	});

	it('keeps admin sections as navigation links with the current section marked active', () => {
		render(AdminLayoutTest);

		const nav = screen.getByRole('navigation', { name: 'Admin sections' });
		const archived = screen.getByRole('link', { name: 'Archived Personnel' });

		expect(nav.contains(archived)).toBe(true);
		expect(screen.getByRole('link', { name: 'Approvals' }).getAttribute('href')).toBe('/org/org-1/admin/approvals');
		expect(archived.getAttribute('href')).toBe('/org/org-1/admin/archived');
		expect(screen.getByRole('link', { name: 'Audit Log' }).getAttribute('href')).toBe('/org/org-1/admin/audit');
		expect(screen.getByRole('link', { name: 'Settings' }).getAttribute('href')).toBe('/org/org-1/admin/settings');
		expect(archived.getAttribute('aria-current')).toBe('page');
		expect(screen.queryByRole('button', { name: 'Archived Personnel' })).toBeNull();
	});
});
