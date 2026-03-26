// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/svelte';
import SmartToolbarTest from './SmartToolbarTest.svelte';
import { computeVisibleItemCount, type SmartToolbarItem } from './SmartToolbar.svelte';

function renderToolbar(items: SmartToolbarItem[], opts?: { narrow?: boolean; title?: string; helpTopic?: string }) {
	return render(SmartToolbarTest, {
		props: { items, narrow: opts?.narrow, title: opts?.title, helpTopic: opts?.helpTopic }
	});
}

describe('SmartToolbar', () => {
	beforeEach(() => {
		cleanup();
	});

	describe('responsive collapse math', () => {
		it('keeps all items visible when there is enough room for the inline controls and overflow trigger', () => {
			const visibleCount = computeVisibleItemCount({
				containerWidth: 380,
				itemWidths: [100, 90, 80],
				overflowWidth: 70,
				gapWidth: 8,
				hasOverflowItems: true
			});

			expect(visibleCount).toBe(3);
		});

		it('collapses items one-by-one from the right as space runs out', () => {
			const visibleCount = computeVisibleItemCount({
				containerWidth: 260,
				itemWidths: [100, 90, 80],
				overflowWidth: 70,
				gapWidth: 8,
				hasOverflowItems: true
			});

			expect(visibleCount).toBe(1);
		});

		it('supports a forced fully-collapsed narrow mode', () => {
			const visibleCount = computeVisibleItemCount({
				containerWidth: 500,
				itemWidths: [100, 90, 80],
				overflowWidth: 70,
				gapWidth: 8,
				hasOverflowItems: false,
				forceCollapse: true
			});

			expect(visibleCount).toBe(0);
		});
	});

	describe('keyboard and focus management', () => {
		it('clicking outside closes an open dropdown', async () => {
			renderToolbar([
				{
					type: 'dropdown',
					label: 'Bulk Status',
					items: [{ label: 'Add Bulk', onclick: vi.fn() }]
				}
			]);

			await fireEvent.click(screen.getByRole('button', { name: /Bulk Status/ }));
			expect(screen.getByRole('menu')).toBeTruthy();

			await fireEvent.mouseDown(document.body);
			expect(screen.queryByRole('menu')).toBeNull();
		});

		it('pressing Escape closes an open dropdown', async () => {
			renderToolbar([
				{
					type: 'dropdown',
					label: 'Bulk Status',
					items: [{ label: 'Add Bulk', onclick: vi.fn() }]
				}
			]);

			await fireEvent.click(screen.getByRole('button', { name: /Bulk Status/ }));
			expect(screen.getByRole('menu')).toBeTruthy();

			await fireEvent.keyDown(document.body, { key: 'Escape' });
			expect(screen.queryByRole('menu')).toBeNull();
		});
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

		it('disabled dropdown triggers cannot be opened', async () => {
			renderToolbar([
				{
					type: 'dropdown',
					label: 'Bulk Status',
					disabled: true,
					items: [{ label: 'Add Bulk', onclick: vi.fn() }]
				}
			]);

			const trigger = screen.getByRole('button', { name: /Bulk Status/ });
			expect(trigger.hasAttribute('disabled')).toBe(true);
			await fireEvent.click(trigger);
			expect(screen.queryByRole('menu')).toBeNull();
		});
	});

	describe('narrow mode', () => {
		it('in narrow mode, visible buttons appear inside the overflow menu', async () => {
			renderToolbar(
				[
					{ type: 'button', label: 'Add Bulk', onclick: vi.fn() },
					{ type: 'button', label: 'Remove Bulk', onclick: vi.fn() }
				],
				{ narrow: true }
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
				{ narrow: true }
			);

			// Dropdown trigger should NOT be rendered inline
			expect(screen.queryByRole('button', { name: /Bulk Status/ })).toBeNull();

			// Open the overflow menu
			await fireEvent.click(screen.getByRole('button', { name: /more/i }));
			const menu = screen.getByRole('menu');

			// Section header should appear
			expect(within(menu).getByText('Bulk Status')).toBeTruthy();
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

		it('renders icon-button with href as an anchor link', () => {
			renderToolbar([{ type: 'icon-button', label: 'Settings', icon: '<svg></svg>', href: '/settings' }]);

			const link = screen.getByRole('link', { name: 'Settings' });
			expect(link).toBeTruthy();
			expect(link.getAttribute('href')).toBe('/settings');
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

		it('applies active state to inline buttons', () => {
			renderToolbar([{ type: 'button', label: "Today's Summary", onclick: vi.fn(), active: true }]);

			const button = screen.getByRole('button', { name: "Today's Summary" });
			expect(button.getAttribute('aria-pressed')).toBe('true');
			expect(button.className).toContain('active');
		});
	});

	describe('page-level features', () => {
		it('renders title as a heading when provided', () => {
			renderToolbar([], { title: 'Calendar' });

			const heading = screen.getByRole('heading', { name: 'Calendar' });
			expect(heading).toBeTruthy();
		});

		it('dropdown item with active flag shows a checkmark', async () => {
			renderToolbar([
				{
					type: 'dropdown',
					label: 'View',
					items: [{ label: 'Show Labels', onclick: vi.fn(), active: true }]
				}
			]);

			await fireEvent.click(screen.getByRole('button', { name: /View/ }));
			const menuItem = screen.getByRole('menuitem', { name: /Show Labels/ });
			expect(menuItem.textContent).toContain('✓');
		});

		it('renders help button when helpTopic is provided', () => {
			renderToolbar([], { title: 'Calendar', helpTopic: 'calendar' });

			const helpBtn = screen.getByRole('button', { name: /help/i });
			expect(helpBtn).toBeTruthy();
		});

		it('renders children snippet content in the toolbar', () => {
			render(SmartToolbarTest, { props: { items: [], title: 'Calendar', childContent: 'Custom Toggle' } });

			expect(screen.getByText('Custom Toggle')).toBeTruthy();
		});
	});
});
