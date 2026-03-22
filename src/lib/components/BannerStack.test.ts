// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, cleanup } from '@testing-library/svelte';
import BannerStackTest from './BannerStackTest.svelte';

// Mock ResizeObserver since happy-dom doesn't have it
const mockObserve = vi.fn();
const mockDisconnect = vi.fn();

class MockResizeObserver {
	constructor(_callback: ResizeObserverCallback) {}
	observe = mockObserve;
	disconnect = mockDisconnect;
	unobserve = vi.fn();
}

vi.stubGlobal('ResizeObserver', MockResizeObserver);

describe('BannerStack', () => {
	beforeEach(() => {
		cleanup();
		vi.clearAllMocks();
	});

	it('should render the banner stack container', () => {
		const { container } = render(BannerStackTest);
		const stack = container.querySelector('.banner-stack');
		expect(stack).toBeTruthy();
	});

	it('should observe the container with ResizeObserver', () => {
		render(BannerStackTest);
		expect(mockObserve).toHaveBeenCalled();
	});

	it('should render children inside the stack', () => {
		const { container } = render(BannerStackTest);
		expect(container.querySelector('[data-testid="test-banner"]')).toBeTruthy();
	});

	it('should disconnect ResizeObserver on unmount', () => {
		const { unmount } = render(BannerStackTest);
		unmount();
		expect(mockDisconnect).toHaveBeenCalled();
	});
});
