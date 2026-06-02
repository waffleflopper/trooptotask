// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/svelte';
import { beforeEach, describe, expect, it } from 'vitest';
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
});
