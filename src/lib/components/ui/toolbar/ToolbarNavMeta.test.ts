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

		const nav = screen.getByRole('navigation', { name: 'Organization sections' });
		const overview = screen.getByRole('link', { name: 'Overview' });
		const personnel = screen.getByRole('link', { name: 'Personnel' });

		expect(nav.contains(overview)).toBe(true);
		expect(overview.getAttribute('href')).toBe('/org/org-1/settings');
		expect(overview.getAttribute('aria-current')).toBe('page');
		expect(personnel.getAttribute('href')).toBe('/org/org-1/personnel');
		expect(personnel.getAttribute('aria-current')).toBeNull();
	});

	it('renders passive meta content as status text, not a command', () => {
		render(ToolbarNavMetaTest, { props: { pending: true } });

		expect(screen.getByRole('status', { name: 'Unsaved changes' })).toBeTruthy();
		expect(screen.queryByRole('button', { name: 'Unsaved changes' })).toBeNull();
		expect(screen.queryByRole('link', { name: 'Unsaved changes' })).toBeNull();
	});

	it('keeps nav available in compact mode without moving links into command overflow', () => {
		render(ToolbarNavMetaTest, { props: { compact: true } });

		const nav = screen.getByRole('navigation', { name: 'Organization sections' });

		expect(nav.getAttribute('data-compact')).toBe('true');
		expect(screen.getByRole('link', { name: 'Overview' })).toBeTruthy();
		expect(screen.queryByRole('button', { name: /more/i })).toBeNull();
	});

	it('renders disabled nav items without link semantics or a tab stop', () => {
		render(ToolbarNavMetaTest);

		const locked = screen.getByText('Locked Billing');

		expect(locked.getAttribute('aria-disabled')).toBe('true');
		expect(locked.getAttribute('href')).toBeNull();
		expect(locked.getAttribute('role')).toBeNull();
		expect(locked.getAttribute('tabindex')).toBeNull();
		expect(locked.getAttribute('title')).toBe('Upgrade to edit');
		expect(locked.getAttribute('aria-describedby')).toBeTruthy();
		expect(screen.queryByRole('link', { name: 'Locked Billing' })).toBeNull();
	});
});
