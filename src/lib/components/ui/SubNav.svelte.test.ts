// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/svelte';
import SubNavTest from './SubNavTest.svelte';

const defaultTabs = [
	{ label: 'Approvals', value: 'approvals', badge: 3 },
	{ label: 'Archived', value: 'archived' },
	{ label: 'Audit Log', value: 'audit' },
	{ label: 'Settings', value: 'settings' }
];

function renderSubNav(overrides: Record<string, unknown> = {}) {
	return render(SubNavTest, {
		props: {
			tabs: defaultTabs,
			active: 'approvals',
			onChange: vi.fn(),
			...overrides
		}
	});
}

describe('SubNav', () => {
	beforeEach(() => {
		cleanup();
	});

	it('should render all tab labels as buttons', () => {
		renderSubNav();
		expect(screen.getByRole('button', { name: /Approvals/ })).toBeTruthy();
		expect(screen.getByRole('button', { name: /Archived/ })).toBeTruthy();
		expect(screen.getByRole('button', { name: /Audit Log/ })).toBeTruthy();
		expect(screen.getByRole('button', { name: /Settings/ })).toBeTruthy();
	});

	it('should mark active tab with aria-current', () => {
		renderSubNav({ active: 'archived' });
		const archived = screen.getByRole('button', { name: /Archived/ });
		expect(archived.getAttribute('aria-current')).toBe('page');

		const approvals = screen.getByRole('button', { name: /Approvals/ });
		expect(approvals.getAttribute('aria-current')).toBeNull();
	});

	it('should call onChange when a tab is clicked', async () => {
		const onChange = vi.fn();
		renderSubNav({ onChange });

		await fireEvent.click(screen.getByRole('button', { name: /Settings/ }));
		expect(onChange).toHaveBeenCalledWith('settings');
	});

	it('should render badge count when provided', () => {
		renderSubNav();
		const badge = screen.getByText('3');
		expect(badge).toBeTruthy();
		expect(badge.className).toContain('tab-badge');
	});

	it('should apply pill variant class', () => {
		renderSubNav({ variant: 'pill' });
		const nav = screen.getByRole('navigation');
		expect(nav.className).toContain('pill');
	});

	it('should default to underline variant', () => {
		renderSubNav();
		const nav = screen.getByRole('navigation');
		expect(nav.className).toContain('underline');
	});
});
