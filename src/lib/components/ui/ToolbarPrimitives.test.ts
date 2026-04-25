// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ToolbarPrimitivesTest from './ToolbarPrimitivesTest.svelte';

describe('toolbar primitives', () => {
	beforeEach(() => {
		cleanup();
	});

	it('exposes a labelled toolbar search that reports typed text', async () => {
		const onSearchChange = vi.fn();
		render(ToolbarPrimitivesTest, { props: { onSearchChange } });

		const search = screen.getByLabelText('Roster search') as HTMLInputElement;
		await fireEvent.input(search, { target: { value: 'smith' } });

		expect(search.value).toBe('smith');
		expect(onSearchChange).toHaveBeenCalledWith('smith');
	});

	it('exposes a labelled toolbar select that reports the selected option', async () => {
		const onSelectChange = vi.fn();
		render(ToolbarPrimitivesTest, { props: { onSelectChange } });

		const select = screen.getByLabelText('Group filter') as HTMLSelectElement;
		await fireEvent.change(select, { target: { value: 'alpha' } });

		expect(select.value).toBe('alpha');
		expect(onSelectChange).toHaveBeenCalledWith('alpha');
	});

	it('renders a segmented control with a single active choice', async () => {
		const onSegmentChange = vi.fn();
		render(ToolbarPrimitivesTest, { props: { onSegmentChange } });

		await fireEvent.click(screen.getByRole('button', { name: 'By Group' }));

		expect(screen.getByRole('button', { name: 'A-Z' }).getAttribute('aria-pressed')).toBe('false');
		expect(screen.getByRole('button', { name: 'By Group' }).getAttribute('aria-pressed')).toBe('true');
		expect(onSegmentChange).toHaveBeenCalledWith('by-group');
	});

	it('requires accessible names for icon buttons and overflow actions', async () => {
		const onIconClick = vi.fn();
		const onOverflowClick = vi.fn();
		render(ToolbarPrimitivesTest, { props: { onIconClick, onOverflowClick } });

		await fireEvent.click(screen.getByRole('button', { name: 'Export roster' }));
		await fireEvent.click(screen.getByRole('button', { name: 'More roster actions' }));
		await fireEvent.click(screen.getByRole('menuitem', { name: 'Bulk Import' }));

		expect(onIconClick).toHaveBeenCalledOnce();
		expect(onOverflowClick).toHaveBeenCalledOnce();
	});

	it('closes the overflow menu when the trigger is clicked again', async () => {
		render(ToolbarPrimitivesTest);

		const moreButton = screen.getByRole('button', { name: 'More roster actions' });
		await fireEvent.click(moreButton);
		expect(screen.getByRole('menuitem', { name: 'Bulk Import' })).toBeTruthy();

		await fireEvent.mouseDown(moreButton);
		await fireEvent.click(moreButton);
		expect(screen.queryByRole('menuitem', { name: 'Bulk Import' })).toBeNull();
	});
});
