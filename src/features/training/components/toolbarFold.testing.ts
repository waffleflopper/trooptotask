import { fireEvent, screen } from '@testing-library/svelte';
import { tick } from 'svelte';
import { vi } from 'vitest';

class FakeResizeObserver {
	static all = new Set<FakeResizeObserver>();
	#targets = new Set<Element>();
	constructor(private callback: ResizeObserverCallback) {
		FakeResizeObserver.all.add(this);
	}
	observe(target: Element) {
		this.#targets.add(target);
	}
	unobserve(target: Element) {
		this.#targets.delete(target);
	}
	disconnect() {
		this.#targets.clear();
		FakeResizeObserver.all.delete(this);
	}
	deliver(widthOf: (target: Element) => number) {
		const entries = [...this.#targets].map((target) => {
			const box = [{ inlineSize: widthOf(target), blockSize: 32 }];
			return { target, borderBoxSize: box, contentBoxSize: box };
		});
		this.callback(entries as unknown as ResizeObserverEntry[], this as unknown as ResizeObserver);
	}
}

export const ITEM_WIDTH = 100;
export const MORE_WIDTH = 32;

/**
 * Stand-in for the browser's layout: every toolbar item is `ITEM_WIDTH` wide and More is `MORE_WIDTH`,
 * so a row of `available` pixels folds items in the toolbar's own order. Call before rendering.
 */
export function stubToolbarLayout(): { resize: (available: number) => Promise<void>; restore: () => void } {
	vi.stubGlobal('ResizeObserver', FakeResizeObserver);
	return {
		async resize(available) {
			const widthOf = (target: Element): number => {
				const element = target as HTMLElement;
				if (element.hasAttribute('data-toolbar-row')) return available;
				if (element.hasAttribute('data-toolbar-more')) return MORE_WIDTH;
				if (element.dataset.toolbarSearchMeasure === 'field') return 160;
				if (element.dataset.toolbarSearchMeasure === 'icon') return 32;
				return ITEM_WIDTH;
			};
			for (const observer of FakeResizeObserver.all) observer.deliver(widthOf);
			await tick();
		},
		restore() {
			FakeResizeObserver.all.clear();
			vi.unstubAllGlobals();
		}
	};
}

export async function openMoreMenu(toolbarName: string): Promise<HTMLElement> {
	const trigger = screen.getByRole('button', { name: `More ${toolbarName}` });
	trigger.focus();
	await fireEvent.keyDown(trigger, { key: 'Enter' });
	return screen.findByRole('menu');
}

export async function openSubmenu(name: string): Promise<void> {
	const trigger = await screen.findByRole('menuitem', { name });
	trigger.focus();
	await fireEvent.keyDown(trigger, { key: 'ArrowRight' });
}

export function describedBy(element: HTMLElement): string {
	return (element.getAttribute('aria-describedby') ?? '')
		.split(' ')
		.filter(Boolean)
		.map((id) => document.getElementById(id)?.textContent ?? '')
		.join(' ');
}
