import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assertPageBound } from './perf-command.mjs';

const perfPages = { 3: 'perfWide' };

test('a page signed in as the named actor is accepted', () => {
	assert.doesNotThrow(() => assertPageBound(perfPages, { pageId: 3, actor: 'perfWide' }));
});

test('a page signed in as the other actor is rejected, so a scoped label never records wide RLS', () => {
	assert.throws(
		() => assertPageBound(perfPages, { pageId: 3, actor: 'perfScoped' }),
		/Page 3 is signed in as perfWide, not perfScoped/
	);
});

test('a page the control never signed in is rejected', () => {
	assert.throws(() => assertPageBound(perfPages, { pageId: 9, actor: 'perfWide' }), /Page 9 was not signed in/);
	assert.throws(() => assertPageBound(undefined, { pageId: 3, actor: 'perfWide' }), /not signed in/);
});
