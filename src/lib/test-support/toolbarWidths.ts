import { fireEvent, screen } from '@testing-library/svelte';
import { tick } from 'svelte';
import { vi } from 'vitest';

type Observer = { callback: ResizeObserverCallback; targets: Set<Element> };

export type ToolbarWidths = {
	/** Delivers one layout: the live row is `row` wide and every other measured control is `control` wide. */
	layOut(row: number, control?: number): Promise<void>;
	foldAll(): Promise<void>;
};

/** Stubs `ResizeObserver` before a toolbar mounts, because happy-dom never measures anything. */
export function stubToolbarWidths(): ToolbarWidths {
	const observers = new Set<Observer>();
	vi.stubGlobal(
		'ResizeObserver',
		class {
			#observer: Observer;
			constructor(callback: ResizeObserverCallback) {
				this.#observer = { callback, targets: new Set() };
				observers.add(this.#observer);
			}
			observe(target: Element) {
				this.#observer.targets.add(target);
			}
			unobserve(target: Element) {
				this.#observer.targets.delete(target);
			}
			disconnect() {
				observers.delete(this.#observer);
			}
		}
	);

	async function layOut(row: number, control = 40): Promise<void> {
		for (const { callback, targets } of observers) {
			const entries = [...targets].map((target) => {
				const box = [{ inlineSize: target.hasAttribute('data-toolbar-row') ? row : control, blockSize: 32 }];
				return { target, borderBoxSize: box, contentBoxSize: box };
			});
			callback(entries as unknown as ResizeObserverEntry[], {} as ResizeObserver);
		}
		await tick();
	}

	return { layOut, foldAll: () => layOut(1) };
}

export async function openToolbarMore(toolbarLabel: string): Promise<HTMLElement> {
	const trigger = screen.getByRole('button', { name: `More ${toolbarLabel}` });
	trigger.focus();
	await fireEvent.keyDown(trigger, { key: 'Enter' });
	return screen.findByRole('menu');
}

export async function openToolbarSubmenu(name: string): Promise<void> {
	const trigger = screen.getByRole('menuitem', { name });
	trigger.focus();
	await fireEvent.keyDown(trigger, { key: 'ArrowRight' });
}

export function toolbarDescription(element: HTMLElement): string {
	return (element.getAttribute('aria-describedby') ?? '')
		.split(' ')
		.filter(Boolean)
		.map((id) => document.getElementById(id)?.textContent ?? '')
		.join(' ');
}
