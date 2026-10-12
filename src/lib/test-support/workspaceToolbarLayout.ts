import { tick } from 'svelte';
import { vi } from 'vitest';

type Observer = { callback: ResizeObserverCallback; targets: Set<Element> };

/**
 * Replaces ResizeObserver so a test can lay every WorkspaceToolbar out at one row width.
 * Each control measures `controlWidth`; `layOut(1)` folds everything a toolbar can fold.
 * Undo with `vi.unstubAllGlobals()`.
 */
export function stubWorkspaceToolbarLayout(controlWidth = 40): (rowWidth: number) => Promise<void> {
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

	return async (rowWidth) => {
		for (const { callback, targets } of observers) {
			const entries = [...targets].map((target) => {
				const inlineSize = target.hasAttribute('data-toolbar-row') ? rowWidth : controlWidth;
				const box = [{ inlineSize, blockSize: 32 }];
				return { target, borderBoxSize: box, contentBoxSize: box };
			});
			callback(entries as unknown as ResizeObserverEntry[], {} as ResizeObserver);
		}
		await tick();
	};
}
