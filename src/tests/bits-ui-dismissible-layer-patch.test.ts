import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);

describe('bits-ui timer cleanup patches', () => {
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

	it('snapshots alert dialog focus targets before delayed autofocus', () => {
		const bitsUiDist = dirname(require.resolve('bits-ui'));
		const source = readFileSync(join(bitsUiDist, 'bits/alert-dialog/components/alert-dialog-content.svelte'), 'utf8');

		expect(source).toContain('const contentNode = contentState.opts.ref.current;');
		expect(source).toContain('afterSleep(0, () => contentNode?.focus());');
	});
});
