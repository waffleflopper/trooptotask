// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ToolbarActions from './ToolbarActions.svelte';
import ToolbarActionsCoordinatorTest from './ToolbarActionsCoordinatorTest.svelte';
import type { ToolbarAction, ToolbarActionMeasurement } from './toolbar.types';

const actions: ToolbarAction[] = [
	{ id: 'export', label: 'Export CSV', href: '/export.csv', icon: 'download', priority: 'low' },
	{
		id: 'import',
		label: 'Import Completions',
		onclick: vi.fn(),
		icon: 'upload',
		disabled: true,
		disabledReason: 'Upload requires personnel and tasks.'
	},
	{ id: 'library', label: 'Task Library', href: '/library', icon: 'book-open' },
	{ id: 'reports', label: 'Reports', href: '/reports', icon: 'chart' },
	{
		id: 'record',
		label: 'Record Training',
		onclick: vi.fn(),
		icon: 'clipboard-check',
		priority: 'critical',
		variant: 'primary',
		overflow: 'never',
		disabled: true,
		disabledReason: 'Add personnel and active tasks first.'
	}
];

describe('ToolbarActions', () => {
	afterEach(() => {
		cleanup();
		vi.restoreAllMocks();
	});

	it('renders overflow actions through a generated command menu in author order', async () => {
		render(ToolbarActions, {
			props: {
				actions,
				ariaLabel: 'Critical Tasks actions',
				overflowAriaLabel: 'More Critical Tasks actions',
				containerWidth: 120
			}
		});

		expect(screen.queryByRole('link', { name: 'Export CSV' })).toBeNull();
		expect(screen.getByRole('button', { name: /Record Training/ }).hasAttribute('disabled')).toBe(true);

		await fireEvent.click(screen.getByRole('button', { name: 'More Critical Tasks actions' }));
		const menu = screen.getByRole('menu');
		const items = within(menu).getAllByRole('menuitem');
		expect(items.map((item) => item.textContent?.trim())).toEqual([
			'Export CSV',
			'Import Completions Upload requires personnel and tasks.',
			'Task Library',
			'Reports'
		]);
		expect(
			within(menu)
				.getByRole('menuitem', { name: /Import Completions/ })
				.getAttribute('aria-disabled')
		).toBe('true');
	});

	it('keeps protected actions out of overflow and warns when they cannot fit', () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

		render(ToolbarActions, {
			props: {
				actions: [actions[4]],
				ariaLabel: 'Critical Tasks actions',
				overflowAriaLabel: 'More Critical Tasks actions',
				containerWidth: 24,
				actionMeasurements: { record: { fullWidth: 140, compactWidth: 92 } }
			}
		});

		expect(screen.getByRole('button', { name: /Record Training/ }).hasAttribute('disabled')).toBe(true);
		expect(screen.queryByRole('button', { name: 'More Critical Tasks actions' })).toBeNull();
		expect(warn).toHaveBeenCalledWith(
			'[ToolbarActions] Toolbar protected actions cannot fit within 24px: record requires 92px.'
		);
	});

	it('keeps measurement-only disabled reason IDs distinct from visible actions', () => {
		render(ToolbarActions, {
			props: {
				actions,
				ariaLabel: 'Critical Tasks actions',
				overflowAriaLabel: 'More Critical Tasks actions',
				containerWidth: 320
			}
		});

		const ids = Array.from(document.querySelectorAll<HTMLElement>('[id]')).map((element) => element.id);

		expect(ids.filter((id) => id === 'toolbar-action-import-reason')).toHaveLength(1);
		expect(ids.filter((id) => id === 'toolbar-action-record-reason')).toHaveLength(1);
		expect(new Set(ids).size).toBe(ids.length);
	});

	it('renders dropdown actions and preserves toggle state in generated overflow', async () => {
		render(ToolbarActions, {
			props: {
				actions: [
					{
						id: 'bulk-status',
						label: 'Bulk Status',
						menuItems: [
							{ label: 'Add Bulk', href: '/calendar/bulk?tab=add' },
							{ label: 'Remove Bulk', href: '/calendar/bulk?tab=remove' }
						]
					},
					{
						id: 'show-status-text',
						label: 'Show Status Text',
						onclick: vi.fn(),
						toggle: true,
						active: true,
						priority: 'low'
					}
				],
				ariaLabel: 'Calendar actions',
				overflowAriaLabel: 'More Calendar actions',
				containerWidth: 180,
				actionMeasurements: {
					'bulk-status': { fullWidth: 120, compactWidth: 120 },
					'show-status-text': { fullWidth: 160, compactWidth: 160 }
				}
			}
		});

		await fireEvent.click(screen.getByRole('button', { name: 'Bulk Status' }));
		expect(screen.getByRole('menuitem', { name: 'Add Bulk' }).getAttribute('href')).toBe('/calendar/bulk?tab=add');
		expect(screen.getByRole('button', { name: 'Bulk Status' }).querySelector('svg')).toBeTruthy();

		await fireEvent.click(screen.getByRole('button', { name: 'More Calendar actions' }));
		const overflowMenu = screen.getByRole('menu');
		expect(within(overflowMenu).getByRole('menuitem', { name: /Show Status Text/ }).textContent).toContain('✓');
	});

	it('flattens overflowed dropdown actions under one group header', async () => {
		render(ToolbarActions, {
			props: {
				actions: [
					{
						id: 'bulk-status',
						label: 'Bulk Status',
						menuItems: [
							{ label: 'Add Bulk', href: '/calendar/bulk?tab=add' },
							{ label: 'Remove Bulk', href: '/calendar/bulk?tab=remove' },
							{ label: 'Import CSV', href: '/calendar/bulk?tab=import' }
						],
						priority: 'low'
					}
				],
				ariaLabel: 'Calendar actions',
				overflowAriaLabel: 'More Calendar actions',
				containerWidth: 40,
				actionMeasurements: {
					'bulk-status': { fullWidth: 120, compactWidth: 120 }
				}
			}
		});

		await fireEvent.click(screen.getByRole('button', { name: 'More Calendar actions' }));
		const menu = screen.getByRole('menu');

		expect(within(menu).getAllByText('Bulk Status')).toHaveLength(1);
		expect(within(menu).getByRole('menuitem', { name: 'Import CSV' })).toBeTruthy();
	});

	it('exposes disabled dropdown reasons to assistive technology', () => {
		render(ToolbarActions, {
			props: {
				actions: [
					{
						id: 'bulk-status',
						label: 'Bulk Status',
						disabled: true,
						disabledReason: 'Read-only mode',
						menuItems: [{ label: 'Add Bulk', href: '/calendar/bulk?tab=add' }]
					}
				],
				ariaLabel: 'Calendar actions',
				overflowAriaLabel: 'More Calendar actions',
				containerWidth: 320
			}
		});

		const trigger = screen.getByRole('button', { name: 'Bulk Status' });
		const descriptionId = trigger.getAttribute('aria-describedby');

		expect(trigger.hasAttribute('disabled')).toBe(true);
		expect(descriptionId).toBeTruthy();
		expect(document.getElementById(descriptionId!)?.textContent).toBe('Read-only mode');
	});

	it('uses the toolbar coordinator as the available width and re-expands when that width returns', async () => {
		vi.spyOn(console, 'warn').mockImplementation(() => {});
		const getBoundingClientRect = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect');
		getBoundingClientRect.mockImplementation(function (this: HTMLElement) {
			if (this.classList.contains('toolbar-actions')) {
				return { width: 320, height: 40, top: 0, left: 0, right: 320, bottom: 40, x: 0, y: 0, toJSON: () => ({}) };
			}
			return { width: 40, height: 40, top: 0, left: 0, right: 40, bottom: 40, x: 0, y: 0, toJSON: () => ({}) };
		});

		const props: {
			availableActionWidth: number;
			actions: ToolbarAction[];
			actionMeasurements: Record<string, ToolbarActionMeasurement>;
		} = {
			availableActionWidth: 80,
			actions: [
				{ id: 'export', label: 'Export', href: '/export.csv', icon: 'download', priority: 'low' },
				{
					id: 'record',
					label: 'Record Training',
					icon: 'clipboard-check',
					priority: 'critical',
					overflow: 'never',
					onclick: vi.fn()
				}
			],
			actionMeasurements: {
				export: { fullWidth: 92, compactWidth: 40 },
				record: { fullWidth: 132, compactWidth: 40 }
			}
		};

		const { rerender } = render(ToolbarActionsCoordinatorTest, {
			props: {
				...props
			}
		});

		expect(screen.queryByRole('link', { name: 'Export' })).toBeNull();
		expect(screen.getByRole('button', { name: 'More measured actions' })).toBeTruthy();

		await rerender({ ...props, availableActionWidth: 320 });

		expect(await screen.findByRole('link', { name: 'Export' })).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Record Training' })).toBeTruthy();
		expect(screen.queryByRole('button', { name: 'More measured actions' })).toBeNull();
	});

	it('renders full actions when the coordinator reserves the published full footprint', () => {
		const actionMeasurements = {
			'clear-filters': { fullWidth: 116, compactWidth: 116 },
			export: { fullWidth: 104, compactWidth: 40 }
		};

		render(ToolbarActionsCoordinatorTest, {
			props: {
				availableActionWidth: 228,
				actions: [
					{ id: 'clear-filters', label: 'Clear filters', onclick: vi.fn(), priority: 'normal' },
					{ id: 'export', label: 'Export', href: '/export.csv', icon: 'download', priority: 'critical' }
				],
				actionMeasurements
			}
		});

		expect(screen.getByRole('button', { name: 'Clear filters' })).toBeTruthy();
		expect(screen.getByRole('link', { name: 'Export' })).toBeTruthy();
		expect(screen.queryByRole('button', { name: 'More measured actions' })).toBeNull();
	});

	it('exposes a stable full-width footprint for parent toolbar fit checks', () => {
		render(ToolbarActions, {
			props: {
				actions: [actions[0], actions[2]],
				ariaLabel: 'Measured actions',
				overflowAriaLabel: 'More measured actions',
				containerWidth: 320,
				actionMeasurements: {
					export: { fullWidth: 92, compactWidth: 40 },
					library: { fullWidth: 128, compactWidth: 40 }
				}
			}
		});

		expect(screen.getByRole('group', { name: 'Measured actions' }).dataset.toolbarActionsRequiredWidth).toBe('228');
	});
});
