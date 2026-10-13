// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { tick } from 'svelte';
import ReorderListTest from './ReorderListTest.svelte';

function names(): string[] {
	return screen.getAllByRole('listitem').map((item) => item.textContent?.trim() ?? '');
}

function mockRows(tops: number[]) {
	screen.getAllByRole('listitem').forEach((row, index) => {
		row.getBoundingClientRect = () => ({ top: tops[index], height: 40, bottom: tops[index] + 40 }) as DOMRect;
	});
}

describe('patterns/reorder-list', () => {
	afterEach(cleanup);

	it('names each grip after its row', () => {
		render(ReorderListTest);
		expect(screen.getByRole('button', { name: 'Reorder Paperwork' })).toBeTruthy();
	});

	it('moves a row with the arrow keys, keeps focus on its grip and announces the new position', async () => {
		render(ReorderListTest);
		const grip = screen.getByRole('button', { name: 'Reorder Orientation' });
		grip.focus();

		await fireEvent.keyDown(grip, { key: 'ArrowDown' });
		await tick();

		expect(names()).toEqual(['Paperwork', 'Orientation', 'Training']);
		expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Reorder Orientation' }));
		expect(screen.getByRole('status').textContent).toBe('Orientation moved to position 2 of 3');
	});

	it('says so at the ends instead of moving', async () => {
		const onmoved = vi.fn();
		render(ReorderListTest, { props: { onmoved } });

		await fireEvent.keyDown(screen.getByRole('button', { name: 'Reorder Orientation' }), { key: 'ArrowUp' });
		expect(screen.getByRole('status').textContent).toBe('Orientation is already first');
		await fireEvent.keyDown(screen.getByRole('button', { name: 'Reorder Training' }), { key: 'ArrowDown' });
		expect(screen.getByRole('status').textContent).toBe('Training is already last');
		expect(onmoved).not.toHaveBeenCalled();
	});

	it('drops a dragged row at the pointer and announces it', async () => {
		render(ReorderListTest);
		mockRows([0, 40, 80]);
		const grip = screen.getByRole('button', { name: 'Reorder Orientation' });

		await fireEvent.pointerDown(grip, { button: 0, pointerId: 1, pointerType: 'mouse' });
		await fireEvent.pointerMove(grip, { clientY: 110, pointerId: 1 });
		expect(screen.getByText('Training').closest('[data-reorder-id]')?.getAttribute('data-drop')).toBe('after');
		await fireEvent.pointerUp(grip, { pointerId: 1 });
		await tick();

		expect(names()).toEqual(['Paperwork', 'Training', 'Orientation']);
		expect(screen.getByRole('status').textContent).toBe('Orientation moved to position 3 of 3');
	});

	it('leaves the order alone when the drag ends where it began or is cancelled', async () => {
		const onmoved = vi.fn();
		render(ReorderListTest, { props: { onmoved } });
		mockRows([0, 40, 80]);
		const grip = screen.getByRole('button', { name: 'Reorder Paperwork' });

		await fireEvent.pointerDown(grip, { button: 0, pointerId: 1, pointerType: 'mouse' });
		await fireEvent.pointerMove(grip, { clientY: 50, pointerId: 1 });
		await fireEvent.pointerUp(grip, { pointerId: 1 });

		await fireEvent.pointerDown(grip, { button: 0, pointerId: 1, pointerType: 'mouse' });
		await fireEvent.pointerMove(grip, { clientY: 5, pointerId: 1 });
		await fireEvent.keyDown(grip, { key: 'Escape' });
		await fireEvent.pointerUp(grip, { pointerId: 1 });

		expect(onmoved).not.toHaveBeenCalled();
		expect(names()).toEqual(['Orientation', 'Paperwork', 'Training']);
	});
});
