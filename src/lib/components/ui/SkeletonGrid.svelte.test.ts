// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/svelte';
import SkeletonGridTest from './SkeletonGridTest.svelte';

function renderGrid(overrides: Record<string, unknown> = {}) {
	return render(SkeletonGridTest, { props: overrides });
}

describe('SkeletonGrid', () => {
	beforeEach(() => {
		cleanup();
	});

	it('should render with aria-hidden for accessibility', () => {
		renderGrid();
		const el = screen.getByTestId('skeleton-grid');
		expect(el.getAttribute('aria-hidden')).toBe('true');
	});

	it('should render correct number of cells with defaults (3 rows x 5 columns)', () => {
		renderGrid();
		const cells = screen.getAllByTestId('skeleton-grid-cell');
		expect(cells.length).toBe(15);
	});

	it('should render custom rows and columns', () => {
		renderGrid({ rows: 4, columns: 3 });
		const cells = screen.getAllByTestId('skeleton-grid-cell');
		expect(cells.length).toBe(12);
	});

	it('should apply skeleton-pulse class to each cell', () => {
		renderGrid({ rows: 2, columns: 2 });
		const cells = screen.getAllByTestId('skeleton-grid-cell');
		for (const cell of cells) {
			expect(cell.className).toContain('skeleton-pulse');
		}
	});

	it('should set grid template columns based on columns prop', () => {
		renderGrid({ columns: 4, cellWidth: '80px' });
		const el = screen.getByTestId('skeleton-grid');
		expect(el.style.gridTemplateColumns).toBe('repeat(4, 80px)');
	});

	it('should apply custom gap', () => {
		renderGrid({ gap: '12px' });
		const el = screen.getByTestId('skeleton-grid');
		expect(el.style.gap).toBe('12px');
	});

	it('should apply custom cell height', () => {
		renderGrid({ rows: 1, columns: 1, cellHeight: '50px' });
		const cells = screen.getAllByTestId('skeleton-grid-cell');
		expect(cells[0].style.height).toBe('50px');
	});
});
