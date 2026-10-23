// @vitest-environment happy-dom
import { cleanup, fireEvent, render } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import { afterEach, describe, expect, it } from 'vitest';
import VirtualList from './virtual-list.svelte';

afterEach(cleanup);

const items = Array.from({ length: 200 }, (_, index) => ({ id: `row-${index}` }));
const item = createRawSnippet((entry: () => { id: string }) => ({
	render: () => `<button type="button">${entry().id}</button>`
}));

function scrollTo(viewport: HTMLElement, top: number) {
	viewport.scrollTop = top;
	return fireEvent.scroll(viewport);
}

describe('VirtualList', () => {
	it('keeps the focused row mounted while it scrolls out of view and back', async () => {
		const { container } = render(VirtualList<{ id: string }>, {
			items,
			key: (entry) => entry.id,
			height: () => 40,
			overscanPx: 80,
			item
		});
		const viewport = container.querySelector<HTMLElement>('[data-slot="virtual-list"]')!;
		const focused = viewport.querySelector<HTMLButtonElement>('[data-virtual-key="row-1"] button')!;
		focused.focus();

		await scrollTo(viewport, 4000);
		expect(viewport.querySelector('[data-virtual-key="row-0"]')).toBeNull();
		expect(focused.isConnected).toBe(true);
		expect(document.activeElement).toBe(focused);

		await scrollTo(viewport, 0);
		expect(viewport.querySelector('[data-virtual-key="row-1"] button')).toBe(focused);
		expect(document.activeElement).toBe(focused);
	});
});
