// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, cleanup } from '@testing-library/svelte';
import BannerStackTest from './BannerStackTest.svelte';

class MockResizeObserver {
	constructor(_callback: ResizeObserverCallback) {}
	observe = vi.fn();
	disconnect = vi.fn();
	unobserve = vi.fn();
}

vi.stubGlobal('ResizeObserver', MockResizeObserver);

describe('BannerStack', () => {
	beforeEach(() => {
		cleanup();
		vi.clearAllMocks();
	});

	it('should render children inside the stack', () => {
		const { container } = render(BannerStackTest);
		expect(container.querySelector('[data-testid="test-banner"]')).toBeTruthy();
	});
});
