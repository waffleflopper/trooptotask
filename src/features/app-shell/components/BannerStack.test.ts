// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import BannerStack from './BannerStack.svelte';

let resize: ResizeObserverCallback | undefined;

vi.stubGlobal(
	'ResizeObserver',
	class {
		constructor(callback: ResizeObserverCallback) {
			resize = callback;
		}
		observe() {}
		unobserve() {}
		disconnect() {}
	}
);

const children = createRawSnippet(() => ({ render: () => '<div role="status">Maintenance tonight</div>' }));

describe('BannerStack', () => {
	afterEach(cleanup);

	it('publishes its measured height for the app frame and clears it on unmount', () => {
		const { getByRole, unmount } = render(BannerStack, { children });
		expect(getByRole('status').textContent).toBe('Maintenance tonight');

		resize?.([{ contentRect: { height: 48 } } as ResizeObserverEntry], {} as ResizeObserver);
		expect(document.documentElement.style.getPropertyValue('--banner-height')).toBe('48px');

		unmount();
		expect(document.documentElement.style.getPropertyValue('--banner-height')).toBe('');
	});
});
