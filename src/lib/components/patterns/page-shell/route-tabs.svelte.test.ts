// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/svelte';
import RouteTabs from './route-tabs.svelte';

vi.mock('$app/paths', () => ({ resolve: (path: string) => path }));

const scrollOffsets = new WeakMap<Element, number>();
const originalRect = Element.prototype.getBoundingClientRect;
const originalScrollLeft = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollLeft');

/** jsdom has no layout: model a 300px strip holding 100px tabs that scrolls through scrollLeft. */
beforeEach(() => {
	Object.defineProperty(Element.prototype, 'scrollLeft', {
		configurable: true,
		get(this: Element) {
			return scrollOffsets.get(this) ?? 0;
		},
		set(this: Element, value: number) {
			scrollOffsets.set(this, Math.max(0, Math.min(100, value)));
		}
	});
	Element.prototype.getBoundingClientRect = function (this: Element) {
		const strip = this.closest('[data-slot="route-tabs"]')?.firstElementChild;
		if (!strip) return { left: 0, right: 0 } as DOMRect;
		if (this === strip) return { left: 0, right: 300 } as DOMRect;
		const left = Array.from(strip.children).indexOf(this) * 100 - (scrollOffsets.get(strip) ?? 0);
		return { left, right: left + 100 } as DOMRect;
	};
});
afterEach(() => {
	cleanup();
	Element.prototype.getBoundingClientRect = originalRect;
	if (originalScrollLeft) Object.defineProperty(Element.prototype, 'scrollLeft', originalScrollLeft);
});

const tabs = (active: string) =>
	['General', 'Members', 'Exports', 'Danger'].map((label) => ({
		label,
		href: `/settings/${label.toLowerCase()}` as '/',
		active: label === active
	}));

describe('Route tabs', () => {
	it('scrolls the tab strip, not the page, to bring the active tab into view on arrival and when it changes', async () => {
		const scrollIntoView = vi.fn();
		Element.prototype.scrollIntoView = scrollIntoView;
		const view = render(RouteTabs, { items: tabs('Danger'), label: 'Sections' });
		const strip = screen.getByRole('navigation', { name: 'Sections' }).firstElementChild as HTMLElement;
		expect(strip.scrollLeft).toBe(100);
		await view.rerender({ items: tabs('General') });
		expect(strip.scrollLeft).toBe(0);
		await view.rerender({ items: tabs('Danger') });
		expect(strip.scrollLeft).toBe(100);
		expect(scrollIntoView).not.toHaveBeenCalled();
	});
});
