// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Actions } from './index.js';
import WorkspaceToolbarTest from './WorkspaceToolbarTest.svelte';

describe('WorkspaceToolbar', () => {
	beforeEach(() => {
		cleanup();
	});

	it('renders a labelled one-row toolbar shell', () => {
		render(WorkspaceToolbarTest);

		const toolbar = screen.getByRole('toolbar', { name: 'Test workspace toolbar' });
		expect(toolbar).toBeTruthy();
	});

	it('keeps active filter and search state in the group label', async () => {
		render(WorkspaceToolbarTest);

		expect(screen.getByRole('group', { name: 'Filters' })).toBeTruthy();

		await fireEvent.click(screen.getByRole('button', { name: 'Gaps only' }));
		expect(screen.getByRole('group', { name: 'Filters, 1 active' })).toBeTruthy();

		await fireEvent.input(screen.getByRole('searchbox', { name: 'Search roster' }), {
			target: { value: 'smith' }
		});

		expect(screen.getByRole('group', { name: 'Filters, 2 active' })).toBeTruthy();
		expect(screen.getByTestId('toolbar-state').textContent).toBe('month|gaps|smith');
	});

	it('preserves selected view toggle state', async () => {
		render(WorkspaceToolbarTest);

		await fireEvent.click(screen.getByRole('button', { name: 'Long range' }));

		expect(screen.getByRole('button', { name: 'Long range' }).getAttribute('aria-pressed')).toBe('true');
		expect(screen.getByRole('button', { name: 'Month' }).getAttribute('aria-pressed')).toBe('false');
		expect(screen.getByTestId('toolbar-state').textContent).toBe('long-range|all|empty');
	});

	it('marks action groups, disabled actions, and loading actions predictably', () => {
		render(WorkspaceToolbarTest);

		const actions = screen.getByTestId('actions-zone');
		expect(actions.dataset.zone).toBe('actions');
		expect(within(actions).getByRole<HTMLButtonElement>('button', { name: 'Import' }).disabled).toBe(true);
		expect(within(actions).getByRole<HTMLButtonElement>('button', { name: 'Syncing roster' }).disabled).toBe(true);
	});

	it('runs an overflow action once its menu has closed', async () => {
		const menusOpenAtRun: number[] = [];
		render(Actions, {
			props: {
				overflowAriaLabel: 'More library actions',
				actions: [
					{
						id: 'import',
						label: 'Import CSV',
						overflow: 'always',
						onclick: () => menusOpenAtRun.push(document.querySelectorAll('[role=menu]').length)
					}
				]
			}
		});

		await fireEvent.click(screen.getByRole('button', { name: 'More library actions' }));
		await fireEvent.click(await screen.findByRole('menuitem', { name: 'Import CSV' }));

		await waitFor(() => expect(menusOpenAtRun).toEqual([0]));
	});

	describe('while a menu close animation is running', () => {
		beforeEach(() => {
			const running = { finished: new Promise(() => undefined), pending: false, playState: 'running' };
			Object.defineProperty(HTMLElement.prototype, 'getAnimations', { configurable: true, value: () => [running] });
		});

		afterEach(() => {
			delete (HTMLElement.prototype as Partial<HTMLElement>).getAnimations;
		});

		it('runs the chosen overflow action once when the menu unmounts before its close finishes', async () => {
			const runs: string[] = [];
			const importAction = {
				id: 'import',
				label: 'Import CSV',
				overflow: 'always' as const,
				onclick: () => runs.push('import')
			};
			const { rerender } = render(Actions, {
				props: { overflowAriaLabel: 'More library actions', actions: [importAction] }
			});

			await fireEvent.click(screen.getByRole('button', { name: 'More library actions' }));
			await fireEvent.click(await screen.findByRole('menuitem', { name: 'Import CSV' }));
			expect(runs).toEqual([]);

			await rerender({ overflowAriaLabel: 'More library actions', actions: [{ ...importAction, overflow: 'never' }] });

			await waitFor(() => expect(runs).toEqual(['import']));
			expect(screen.queryByRole('button', { name: 'More library actions' })).toBeNull();
		});

		it('runs a menu item chosen by Enter when its menu unmounts before its close finishes', async () => {
			const runs: string[] = [];
			const planning = {
				id: 'planning',
				label: 'Planning',
				menuItems: [{ label: 'Assignment Planner', onclick: () => runs.push('planner') }]
			};
			const { rerender } = render(Actions, { props: { overflowAriaLabel: 'More actions', actions: [planning] } });

			await fireEvent.click(screen.getByRole('button', { name: 'Planning' }));
			const item = await screen.findByRole('menuitem', { name: 'Assignment Planner' });
			item.focus();
			await fireEvent.keyDown(item, { key: 'Enter' });
			expect(runs).toEqual([]);

			await rerender({ overflowAriaLabel: 'More actions', actions: [] });

			await waitFor(() => expect(runs).toEqual(['planner']));
		});
	});
});
