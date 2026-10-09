// @vitest-environment happy-dom
// Guards the presence patch in patch-bits-ui-timers.mjs (huntabyte/bits-ui#2146).
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { flushSync, tick } from 'svelte';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);

describe('bits-ui presence animation completion', () => {
	it('skips a deferred completion callback after its owning effect is destroyed', async () => {
		const bitsUiDist = dirname(require.resolve('bits-ui'));
		const { AnimationsComplete } = await import(
			pathToFileURL(join(bitsUiDist, 'internal/animations-complete.js')).href
		);
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

		try {
			const node = document.createElement('div');
			let callbackCalls = 0;

			const destroy = $effect.root(() => {
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
			destroy();
			await tick();
			await Promise.resolve();

			expect(callbackCalls).toBe(0);
			expect(warn).not.toHaveBeenCalled();
		} finally {
			warn.mockRestore();
		}
	});
});
