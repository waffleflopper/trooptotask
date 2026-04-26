// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import ToolbarNavMetaTest from './ToolbarNavMetaTest.svelte';

describe('toolbar nav and meta primitives', () => {
	afterEach(() => {
		cleanup();
	});

	it('renders navigation items as keyboard-accessible links with active state', () => {
		render(ToolbarNavMetaTest);

		const nav = screen.getByRole('navigation', { name: 'Admin sections' });
		const approvals = screen.getByRole('link', { name: 'Approvals' });
		const archived = screen.getByRole('link', { name: 'Archived Personnel' });

		expect(nav.contains(approvals)).toBe(true);
		expect(approvals.getAttribute('href')).toBe('/org/org-1/admin/approvals');
		expect(approvals.getAttribute('aria-current')).toBe('page');
		expect(archived.getAttribute('href')).toBe('/org/org-1/admin/archived');
		expect(archived.getAttribute('aria-current')).toBeNull();
	});

	it('renders passive meta content as status text, not a command', () => {
		render(ToolbarNavMetaTest, { props: { pending: true } });

		expect(screen.getByRole('status', { name: 'Unsaved changes' })).toBeTruthy();
		expect(screen.queryByRole('button', { name: 'Unsaved changes' })).toBeNull();
		expect(screen.queryByRole('link', { name: 'Unsaved changes' })).toBeNull();
	});

	it('keeps nav available in compact mode without moving links into command overflow', () => {
		render(ToolbarNavMetaTest, { props: { compact: true } });

		const nav = screen.getByRole('navigation', { name: 'Admin sections' });

		expect(nav.getAttribute('data-compact')).toBe('true');
		expect(screen.getByRole('link', { name: 'Approvals' })).toBeTruthy();
		expect(screen.queryByRole('button', { name: /more/i })).toBeNull();
	});
});
