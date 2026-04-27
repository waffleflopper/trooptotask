// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ToolbarTest from './ToolbarTest.svelte';

describe('Toolbar', () => {
	beforeEach(() => {
		cleanup();
	});

	it('renders a labelled toolbar with leading and action content', () => {
		render(ToolbarTest);

		expect(screen.getByLabelText('Test controls')).toBeTruthy();
		expect(screen.getByText('History')).toBeTruthy();
		expect(screen.getByText('Add')).toBeTruthy();
	});

	it('applies the requested responsive collapse class', () => {
		render(ToolbarTest, { props: { collapse: 'medium' } });

		const toolbar = screen.getByTestId('toolbar');
		expect(toolbar.className).toContain('toolbar--medium');
	});

	it('allows action content to be omitted', () => {
		render(ToolbarTest, { props: { withActions: false } });

		expect(screen.getByText('History')).toBeTruthy();
		expect(screen.queryByText('Add')).toBeNull();
	});

	it('renders an overflow action slot when actions can collapse', () => {
		render(ToolbarTest, { props: { withOverflow: true } });

		expect(screen.getByRole('button', { name: 'More test actions' })).toBeTruthy();
	});

	it('coordinates compact search, filter panels, Escape, and command overflow', async () => {
		render(ToolbarTest, { props: { containerWidth: 520, withCoordinatedControls: true } });

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
		const { rerender } = render(ToolbarTest, {
			props: { containerWidth: 520, withCoordinatedControls: true }
		});

		expect(screen.getByRole('button', { name: 'Search personnel' })).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Filters' })).toBeTruthy();

		await rerender({ containerWidth: 920, withCoordinatedControls: true });

		expect(screen.getByRole('searchbox', { name: 'Search personnel' })).toBeTruthy();
		expect(screen.getByLabelText('Group filter')).toBeTruthy();
		expect(screen.queryByRole('button', { name: 'Filters' })).toBeNull();
	});

	it('allows wide toolbars to compact search earlier when leading controls need more room', () => {
		render(ToolbarTest, {
			props: { containerWidth: 1100, searchCompactAt: 1180, withCoordinatedControls: true }
		});

		expect(screen.getByRole('button', { name: 'Search personnel' })).toBeTruthy();
		expect(screen.getByLabelText('Group filter')).toBeTruthy();
	});

	it('uses overflowing leading content width when calculating action compaction', async () => {
		const originalRect = HTMLElement.prototype.getBoundingClientRect;
		vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
			if (this.matches('[data-toolbar]')) return rectWithWidth(568);
			if (this.classList.contains('toolbar-group')) return rectWithWidth(260);
			if (this.classList.contains('toolbar-select')) return rectWithWidth(120);
			if (this.classList.contains('toolbar-search')) return rectWithWidth(360);
			if (this.hasAttribute('data-measure-overflow')) return rectWithWidth(40);
			return originalRect.call(this);
		});

		render(ToolbarTest, { props: { containerWidth: 568, groupCompactAt: 300, withMeasuredActions: true } });

		await waitFor(() => {
			expect(screen.getByRole('link', { name: 'Export CSV' }).className).toContain('toolbar-action--compact');
		});
		expect(screen.getByRole('button', { name: 'Record Training' }).className).toContain('toolbar-action--compact');
	});
});

function rectWithWidth(width: number): DOMRect {
	return {
		width,
		height: 40,
		x: 0,
		y: 0,
		top: 0,
		right: width,
		bottom: 40,
		left: 0,
		toJSON: () => ({})
	} as DOMRect;
}
