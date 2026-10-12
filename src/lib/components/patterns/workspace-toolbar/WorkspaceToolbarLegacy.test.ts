// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { tick } from 'svelte';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Actions } from './index.js';
import WorkspaceToolbarTest from './WorkspaceToolbarTest.svelte';

describe('legacy WorkspaceToolbar parts', () => {
	beforeEach(() => {
		cleanup();
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

	it('lists the items of an overflowed menu action and runs the chosen one', async () => {
		const runs: string[] = [];
		render(Actions, {
			props: {
				overflowAriaLabel: 'More actions',
				actions: [
					{
						id: 'bulk-status',
						label: 'Bulk Status',
						overflow: 'always',
						menuItems: [
							{ label: 'Add Bulk', onclick: () => runs.push('add') },
							{ label: 'Remove Bulk', onclick: () => runs.push('remove') }
						]
					}
				]
			}
		});

		await fireEvent.click(screen.getByRole('button', { name: 'More actions' }));
		await fireEvent.click(await screen.findByRole('menuitem', { name: 'Remove Bulk' }));

		await waitFor(() => expect(runs).toEqual(['remove']));
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

		it('runs only the first item chosen while its menu is closing', async () => {
			const runs: string[] = [];
			const planning = {
				id: 'planning',
				label: 'Planning',
				menuItems: [
					{ label: 'Assignment Planner', onclick: () => runs.push('planner') },
					{ label: 'Monthly Plan', onclick: () => runs.push('monthly') }
				]
			};
			const { rerender } = render(Actions, { props: { overflowAriaLabel: 'More actions', actions: [planning] } });

			await fireEvent.click(screen.getByRole('button', { name: 'Planning' }));
			await fireEvent.click(await screen.findByRole('menuitem', { name: 'Assignment Planner' }));
			await fireEvent.click(screen.getByRole('menuitem', { name: 'Monthly Plan' }));
			await rerender({ overflowAriaLabel: 'More actions', actions: [] });

			await waitFor(() => expect(runs).toEqual(['planner']));
		});

		it('drops the chosen action when the whole toolbar unmounts before its close finishes', async () => {
			const runs: string[] = [];
			const planning = {
				id: 'planning',
				label: 'Planning',
				menuItems: [{ label: 'Assignment Planner', onclick: () => runs.push('planner') }]
			};
			const { rerender } = render(Actions, { props: { overflowAriaLabel: 'More actions', actions: [planning] } });

			await fireEvent.click(screen.getByRole('button', { name: 'Planning' }));
			await fireEvent.click(await screen.findByRole('menuitem', { name: 'Assignment Planner' }));
			await rerender({ overflowAriaLabel: 'More actions', actions: [] });
			await waitFor(() => expect(runs).toEqual(['planner']));

			await rerender({ overflowAriaLabel: 'More actions', actions: [planning] });
			await fireEvent.click(screen.getByRole('button', { name: 'Planning' }));
			await fireEvent.click(await screen.findByRole('menuitem', { name: 'Assignment Planner' }));
			cleanup();
			await tick();
			await new Promise((resolve) => setTimeout(resolve));

			expect(runs).toEqual(['planner']);
		});
	});
});
