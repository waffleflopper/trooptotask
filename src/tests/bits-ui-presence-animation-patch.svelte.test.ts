// @vitest-environment happy-dom
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { flushSync, tick } from 'svelte';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);

describe('bits-ui presence animation cleanup patch', () => {
	it('skips deferred animation completion callbacks after their owning effect is destroyed', async () => {
		const bitsUiDist = dirname(require.resolve('bits-ui'));
		const { AnimationsComplete } = await import(
			pathToFileURL(join(bitsUiDist, 'internal/animations-complete.js')).href
		);
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		const node = document.createElement('div');
		let callbackCalls = 0;

		const cleanup = $effect.root(() => {
			const source = $state(true);
			const open = $derived(source);
			const manager = new AnimationsComplete({
				ref: { current: node },
				afterTick: {
					get current() {
						return open;
					}
				}
			});

			manager.run(() => {
				callbackCalls += 1;
				void open;
			});
		});

		flushSync();
		cleanup();
		await tick();
		await Promise.resolve();

		expect(callbackCalls).toBe(0);
		expect(warn.mock.calls.some((call) => call.map(String).join(' ').includes('derived_inert'))).toBe(false);
		warn.mockRestore();
	});
});
