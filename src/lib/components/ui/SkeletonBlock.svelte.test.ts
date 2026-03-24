// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/svelte';
import SkeletonBlockTest from './SkeletonBlockTest.svelte';

function renderBlock(overrides: Record<string, unknown> = {}) {
	return render(SkeletonBlockTest, { props: overrides });
}

describe('SkeletonBlock', () => {
	beforeEach(() => {
		cleanup();
	});

	it('should render with aria-hidden for accessibility', () => {
		renderBlock();
		const el = screen.getByTestId('skeleton-block');
		expect(el.getAttribute('aria-hidden')).toBe('true');
	});

	it('should apply the skeleton-pulse class', () => {
		renderBlock();
		const el = screen.getByTestId('skeleton-block');
		expect(el.className).toContain('skeleton-pulse');
	});

	it('should use default dimensions when no props provided', () => {
		renderBlock();
		const el = screen.getByTestId('skeleton-block');
		expect(el.style.width).toBe('100%');
		expect(el.style.height).toBe('80px');
	});

	it('should accept custom width, height, and borderRadius', () => {
		renderBlock({ width: '100px', height: '60px', borderRadius: '4px' });
		const el = screen.getByTestId('skeleton-block');
		expect(el.style.width).toBe('100px');
		expect(el.style.height).toBe('60px');
		expect(el.style.borderRadius).toBe('4px');
	});
});
