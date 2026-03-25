// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/svelte';
import SmartToolbarTest from './SmartToolbarTest.svelte';
import type { SmartToolbarItem } from './SmartToolbar.svelte';

function renderToolbar(items: SmartToolbarItem[], narrow?: boolean) {
	return render(SmartToolbarTest, { props: { items, narrow } });
}

describe('SmartToolbar', () => {
	beforeEach(() => {
		cleanup();
	});

	describe('dropdown items', () => {
		it('dropdown items with href render as anchor links', async () => {
			renderToolbar([
				{
					type: 'dropdown',
					label: 'Planning',
					items: [{ label: 'Duty Roster', href: '/calendar/duty-roster' }]
				}
			]);

			await fireEvent.click(screen.getByRole('button', { name: /Planning/ }));

			const link = screen.getByRole('menuitem', { name: 'Duty Roster' });
			expect(link.tagName).toBe('A');
			expect(link.getAttribute('href')).toBe('/calendar/duty-roster');
		});

		it('clicking a dropdown item calls onclick and closes the menu', async () => {
			const onAddBulk = vi.fn();
			renderToolbar([
				{
					type: 'dropdown',
					label: 'Bulk Status',
					items: [{ label: 'Add Bulk', onclick: onAddBulk }]
				}
			]);

			await fireEvent.click(screen.getByRole('button', { name: /Bulk Status/ }));
			await fireEvent.click(screen.getByRole('menuitem', { name: 'Add Bulk' }));

			expect(onAddBulk).toHaveBeenCalledOnce();
			expect(screen.queryByRole('menu')).toBeNull();
		});

		it('clicking dropdown button opens its menu', async () => {
			renderToolbar([
				{
					type: 'dropdown',
					label: 'Bulk Status',
					items: [{ label: 'Add Bulk', onclick: vi.fn() }]
				}
			]);

			const trigger = screen.getByRole('button', { name: /Bulk Status/ });
			await fireEvent.click(trigger);

			expect(screen.getByRole('menu')).toBeTruthy();
			expect(screen.getByRole('menuitem', { name: 'Add Bulk' })).toBeTruthy();
		});

		it('renders dropdown as a labeled button with chevron', () => {
			renderToolbar([
				{
					type: 'dropdown',
					label: 'Bulk Status',
					items: [{ label: 'Add Bulk', onclick: vi.fn() }]
				}
			]);

			const trigger = screen.getByRole('button', { name: /Bulk Status/ });
			expect(trigger).toBeTruthy();
			expect(trigger.getAttribute('aria-haspopup')).toBe('menu');
		});
	});

	describe('narrow mode', () => {
		it('in narrow mode, visible buttons appear inside the overflow menu', async () => {
			renderToolbar(
				[
					{ type: 'button', label: 'Add Bulk', onclick: vi.fn() },
					{ type: 'button', label: 'Remove Bulk', onclick: vi.fn() }
				],
				true
			);

			// Buttons should NOT be rendered inline
			expect(screen.queryByRole('button', { name: 'Add Bulk' })).toBeNull();
			expect(screen.queryByRole('button', { name: 'Remove Bulk' })).toBeNull();

			// Should be reachable via the overflow menu
			await fireEvent.click(screen.getByRole('button', { name: /more/i }));
			expect(screen.getByRole('menuitem', { name: 'Add Bulk' })).toBeTruthy();
			expect(screen.getByRole('menuitem', { name: 'Remove Bulk' })).toBeTruthy();
		});

		it('in narrow mode, dropdown groups appear as section headers in the overflow menu', async () => {
			renderToolbar(
				[
					{
						type: 'dropdown',
						label: 'Bulk Status',
						items: [
							{ label: 'Add Bulk', onclick: vi.fn() },
							{ label: 'Remove Bulk', onclick: vi.fn() }
						]
					}
				],
				true
			);

			// Dropdown trigger should NOT be rendered inline
			expect(screen.queryByRole('button', { name: /Bulk Status/ })).toBeNull();

			// Open the overflow menu
			await fireEvent.click(screen.getByRole('button', { name: /more/i }));

			// Section header should appear
			expect(screen.getByText('Bulk Status')).toBeTruthy();
			// Items under the section should appear
			expect(screen.getByRole('menuitem', { name: 'Add Bulk' })).toBeTruthy();
			expect(screen.getByRole('menuitem', { name: 'Remove Bulk' })).toBeTruthy();
		});
	});

	describe('overflow items', () => {
		it('renders overflow items inside a ... menu', async () => {
			const onclick = vi.fn();
			renderToolbar([
				{ type: 'overflow', label: 'Export to Excel', onclick },
				{ type: 'overflow', label: 'Print / PDF', onclick: vi.fn() }
			]);

			const moreBtn = screen.getByRole('button', { name: /more/i });
			await fireEvent.click(moreBtn);

			expect(screen.getByRole('menuitem', { name: 'Export to Excel' })).toBeTruthy();
			expect(screen.getByRole('menuitem', { name: 'Print / PDF' })).toBeTruthy();
		});

		it('clicking an overflow item calls onclick and closes the menu', async () => {
			const onclick = vi.fn();
			renderToolbar([{ type: 'overflow', label: 'Export to Excel', onclick }]);

			await fireEvent.click(screen.getByRole('button', { name: /more/i }));
			await fireEvent.click(screen.getByRole('menuitem', { name: 'Export to Excel' }));

			expect(onclick).toHaveBeenCalledOnce();
			expect(screen.queryByRole('menu')).toBeNull();
		});
	});

	describe('icon-button items', () => {
		it('renders icon-button as an accessible button with aria-label', () => {
			const onclick = vi.fn();
			renderToolbar([{ type: 'icon-button', label: 'Settings', icon: '<svg></svg>', onclick }]);

			const btn = screen.getByRole('button', { name: 'Settings' });
			expect(btn).toBeTruthy();
			expect(btn.getAttribute('aria-label')).toBe('Settings');
		});
	});

	describe('disabled items', () => {
		it('disabled button does not fire onclick when clicked', async () => {
			const onclick = vi.fn();
			renderToolbar([{ type: 'button', label: 'Export', onclick, disabled: true }]);

			await fireEvent.click(screen.getByRole('button', { name: 'Export' }));
			expect(onclick).not.toHaveBeenCalled();
		});

		it('disabled dropdown item does not fire onclick when clicked', async () => {
			const onclick = vi.fn();
			renderToolbar([
				{
					type: 'dropdown',
					label: 'Bulk Status',
					items: [{ label: 'Add Bulk', onclick, disabled: true }]
				}
			]);

			await fireEvent.click(screen.getByRole('button', { name: /Bulk Status/ }));
			await fireEvent.click(screen.getByRole('menuitem', { name: 'Add Bulk' }));
			expect(onclick).not.toHaveBeenCalled();
		});
	});

	describe('button items', () => {
		it('renders visible button items inline', () => {
			renderToolbar([
				{ type: 'button', label: 'Add Bulk', onclick: vi.fn() },
				{ type: 'button', label: 'Remove Bulk', onclick: vi.fn() }
			]);

			expect(screen.getByRole('button', { name: 'Add Bulk' })).toBeTruthy();
			expect(screen.getByRole('button', { name: 'Remove Bulk' })).toBeTruthy();
		});
	});
});
