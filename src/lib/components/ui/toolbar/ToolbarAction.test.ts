// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ToolbarAction from './ToolbarAction.svelte';

describe('ToolbarAction', () => {
	afterEach(() => {
		cleanup();
		vi.restoreAllMocks();
	});

	it('renders href actions as links and onclick actions as buttons', async () => {
		const onclick = vi.fn();
		render(ToolbarAction, {
			props: {
				action: { id: 'reports', label: 'Reports', href: '/reports' },
				mode: 'full'
			}
		});
		render(ToolbarAction, {
			props: {
				action: { id: 'import', label: 'Import Completions', onclick },
				mode: 'full'
			}
		});

		expect(screen.getByRole('link', { name: 'Reports' }).getAttribute('href')).toBe('/reports');
		await fireEvent.click(screen.getByRole('button', { name: 'Import Completions' }));
		expect(onclick).toHaveBeenCalledOnce();
	});

	it('warns in development when an action has both href and onclick', () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

		render(ToolbarAction, {
			props: {
				action: { id: 'bad-action', label: 'Bad Action', href: '/bad', onclick: vi.fn() },
				mode: 'full'
			}
		});

		expect(warn).toHaveBeenCalledWith('[ToolbarAction] bad-action must use either href or onclick, not both.');
	});

	it('keeps icon-only compact actions accessible', () => {
		render(ToolbarAction, {
			props: {
				action: { id: 'export', label: 'Export CSV', href: '/export.csv', icon: 'download' },
				mode: 'compact'
			}
		});

		const link = screen.getByRole('link', { name: 'Export CSV' });
		expect(link.textContent?.trim()).toBe('');
		expect(link.getAttribute('title')).toBe('Export CSV');
	});

	it('preserves disabled state and disabled reason in full and compact render paths', () => {
		render(ToolbarAction, {
			props: {
				action: {
					id: 'record',
					label: 'Record Training',
					onclick: vi.fn(),
					icon: 'clipboard-check',
					disabled: true,
					disabledReason: 'Add personnel and active tasks first.'
				},
				mode: 'full'
			}
		});
		render(ToolbarAction, {
			props: {
				action: {
					id: 'import',
					label: 'Import Completions',
					onclick: vi.fn(),
					icon: 'upload',
					disabled: true,
					disabledReason: 'Upload requires personnel and tasks.'
				},
				mode: 'compact'
			}
		});

		expect(screen.getByRole('button', { name: /Record Training/ }).hasAttribute('disabled')).toBe(true);
		expect(screen.getByText('Add personnel and active tasks first.')).toBeTruthy();
		expect(screen.getByRole('button', { name: /Import Completions/ }).hasAttribute('disabled')).toBe(true);
		expect(screen.getByText('Upload requires personnel and tasks.')).toBeTruthy();
	});
});
