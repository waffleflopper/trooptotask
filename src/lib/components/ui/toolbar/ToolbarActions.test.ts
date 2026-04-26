// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ToolbarActions from './ToolbarActions.svelte';
import type { ToolbarAction } from './toolbar.types';

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
});
