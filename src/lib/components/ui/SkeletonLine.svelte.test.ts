// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/svelte';
import SkeletonLineTest from './SkeletonLineTest.svelte';

function renderLine(overrides: Record<string, unknown> = {}) {
	return render(SkeletonLineTest, { props: overrides });
}

describe('SkeletonLine', () => {
	beforeEach(() => {
		cleanup();
	});

	it('should render with aria-hidden for accessibility', () => {
		renderLine();
		const el = screen.getByTestId('skeleton-line');
		expect(el.getAttribute('aria-hidden')).toBe('true');
	});

	it('should apply the skeleton-pulse class', () => {
		renderLine();
		const el = screen.getByTestId('skeleton-line');
		expect(el.className).toContain('skeleton-pulse');
	});

	it('should use default dimensions when no props provided', () => {
		renderLine();
		const el = screen.getByTestId('skeleton-line');
		expect(el.style.width).toBe('100%');
		expect(el.style.height).toBe('1em');
	});

	it('should accept custom width and height', () => {
		renderLine({ width: '200px', height: '16px' });
		const el = screen.getByTestId('skeleton-line');
		expect(el.style.width).toBe('200px');
		expect(el.style.height).toBe('16px');
	});
});
