// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { beforeEach, describe, expect, it } from 'vitest';
import FloatingPageToolbarTest from './FloatingPageToolbarTest.svelte';

describe('FloatingPageToolbar', () => {
	beforeEach(() => {
		cleanup();
	});

	it('renders a labelled toolbar with leading and action content', () => {
		render(FloatingPageToolbarTest);

		expect(screen.getByLabelText('Test controls')).toBeTruthy();
		expect(screen.getByText('History')).toBeTruthy();
		expect(screen.getByText('Add')).toBeTruthy();
	});

	it('applies the requested responsive collapse class', () => {
		render(FloatingPageToolbarTest, { props: { collapse: 'medium' } });

		const toolbar = screen.getByTestId('floating-page-toolbar');
		expect(toolbar.className).toContain('floating-page-toolbar--medium');
	});

	it('allows action content to be omitted', () => {
		render(FloatingPageToolbarTest, { props: { withActions: false } });

		expect(screen.getByText('History')).toBeTruthy();
		expect(screen.queryByText('Add')).toBeNull();
	});

	it('renders an overflow action slot when actions can collapse', () => {
		render(FloatingPageToolbarTest, { props: { withOverflow: true } });

		expect(screen.getByRole('button', { name: 'More test actions' })).toBeTruthy();
	});

	it('coordinates compact search, filter panels, Escape, and command overflow', async () => {
		render(FloatingPageToolbarTest, { props: { containerWidth: 520, withCoordinatedControls: true } });

		const searchTrigger = screen.getByRole('button', { name: 'Search personnel' });
		const filtersTrigger = screen.getByRole('button', { name: 'Filters' });

		await fireEvent.click(searchTrigger);
		await fireEvent.input(await screen.findByRole('searchbox', { name: 'Search personnel' }), {
			target: { value: 'smith' }
		});
		expect(screen.getByTestId('coordinated-state').textContent).toBe('smith|all|false');

		await fireEvent.click(filtersTrigger);
		await waitFor(() => {
			expect(screen.queryByRole('searchbox', { name: 'Search personnel' })).toBeNull();
		});
		expect(screen.getByTestId('filters-group-panel')).toBeTruthy();

		await fireEvent.change(screen.getByLabelText('Group filter'), { target: { value: 'alpha' } });
		expect(screen.getByTestId('coordinated-state').textContent).toBe('smith|alpha|false');

		await fireEvent.keyDown(window, { key: 'Escape' });
		await waitFor(() => {
			expect(screen.queryByTestId('filters-group-panel')).toBeNull();
		});
		expect(screen.getByTestId('coordinated-state').textContent).toBe('smith|alpha|false');

		await fireEvent.click(searchTrigger);
		await fireEvent.click(screen.getByRole('button', { name: 'More test actions' }));
		await waitFor(() => {
			expect(screen.queryByRole('searchbox', { name: 'Search personnel' })).toBeNull();
		});
		expect(within(screen.getByRole('menu')).getByRole('menuitem', { name: 'Add' })).toBeTruthy();
	});

	it('re-expands compact controls as measured width returns', async () => {
		const { rerender } = render(FloatingPageToolbarTest, {
			props: { containerWidth: 520, withCoordinatedControls: true }
		});

		expect(screen.getByRole('button', { name: 'Search personnel' })).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Filters' })).toBeTruthy();

		await rerender({ containerWidth: 920, withCoordinatedControls: true });

		expect(screen.getByRole('searchbox', { name: 'Search personnel' })).toBeTruthy();
		expect(screen.getByLabelText('Group filter')).toBeTruthy();
		expect(screen.queryByRole('button', { name: 'Filters' })).toBeNull();
	});
});
