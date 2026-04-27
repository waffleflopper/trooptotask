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

		const nav = screen.getByRole('navigation', { name: 'Organization settings sections' });
		const approvals = screen.getByRole('link', { name: 'Approvals' });
		const archived = screen.getByRole('link', { name: 'Archived Personnel' });

		expect(nav.contains(approvals)).toBe(true);
		expect(approvals.getAttribute('href')).toBe('/org/org-1/settings/approvals');
		expect(approvals.getAttribute('aria-current')).toBe('page');
		expect(archived.getAttribute('href')).toBe('/org/org-1/settings/archived');
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

		const nav = screen.getByRole('navigation', { name: 'Organization settings sections' });

		expect(nav.getAttribute('data-compact')).toBe('true');
		expect(screen.getByRole('link', { name: 'Approvals' })).toBeTruthy();
		expect(screen.queryByRole('button', { name: /more/i })).toBeNull();
	});

	it('renders disabled nav items without an active href', () => {
		render(ToolbarNavMetaTest);

		const locked = screen.getByRole('link', { name: 'Locked Settings' });

		expect(locked.getAttribute('aria-disabled')).toBe('true');
		expect(locked.getAttribute('href')).toBeNull();
		expect(locked.getAttribute('title')).toBe('Upgrade to edit');
		expect(locked.getAttribute('aria-describedby')).toBeTruthy();
	});
});
