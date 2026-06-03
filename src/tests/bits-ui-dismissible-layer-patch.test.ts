import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);

describe('bits-ui timer cleanup patches', () => {
	it('guards presence animation afterTick callbacks after cleanup', () => {
		const bitsUiDist = dirname(require.resolve('bits-ui'));
		const source = readFileSync(join(bitsUiDist, 'internal/animations-complete.js'), 'utf8');

		expect(source).toContain('this.#executeCallback(fn, runId);');
		expect(source).toContain('if (runId !== this.#runId)\n                return;\n            fn();');
	});

	it('cancels pending layer registration timers before destroyed boxes are read', () => {
		const bitsUiDist = dirname(require.resolve('bits-ui'));
		const source = readFileSync(
			join(bitsUiDist, 'bits/utilities/dismissible-layer/use-dismissable-layer.svelte.js'),
			'utf8'
		);

		expect(source).toContain('let layerRegistrationTimeout;');
		expect(source).toContain('clearTimeout(layerRegistrationTimeout);');
		expect(source).toContain('layerRegistrationTimeout = afterSleep(1, () => {');
		expect(source).toContain('layerRegistrationTimeout = undefined;');
	});

	it('snapshots dismissible layer focus targets before deferred focus handling', () => {
		const bitsUiDist = dirname(require.resolve('bits-ui'));
		const source = readFileSync(
			join(bitsUiDist, 'bits/utilities/dismissible-layer/use-dismissable-layer.svelte.js'),
			'utf8'
		);

		expect(source).toContain('const layerNode = this.opts.ref.current;');
		expect(source).toContain('isOrContainsTarget(layerNode, event.target)');
	});

	it('guards menu deferred focus callbacks after menu content or items are destroyed', () => {
		const bitsUiDist = dirname(require.resolve('bits-ui'));
		const source = readFileSync(join(bitsUiDist, 'bits/menu/menu.svelte.js'), 'utf8');

		expect(source).toContain('const isUsingKeyboard = this.parentMenu.root.isUsingKeyboard.current;');
		expect(source).toContain('if (this.#destroyed || !isUsingKeyboard)');
		expect(source).toContain('const disabled = this.opts.disabled.current;');
		expect(source).toContain('if (this.#destroyed || e.defaultPrevented || disabled)');
	});

	it('snapshots alert dialog focus targets before delayed autofocus', () => {
		const bitsUiDist = dirname(require.resolve('bits-ui'));
		const source = readFileSync(join(bitsUiDist, 'bits/alert-dialog/components/alert-dialog-content.svelte'), 'utf8');

		expect(source).toContain('const contentNode = contentState.opts.ref.current;');
		expect(source).toContain('afterSleep(0, () => contentNode?.focus());');
	});
});
