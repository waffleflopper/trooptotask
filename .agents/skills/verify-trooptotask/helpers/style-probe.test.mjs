import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Window } from 'happy-dom';
import { diffStyleProbes, readStyleProbe, styleProperties } from './style-probe.mjs';

function page(css, html) {
	const window = new Window({ width: 390, height: 844 });
	window.document.head.innerHTML = `<style>${css}</style>`;
	window.document.documentElement.dataset.theme = 'dark';
	window.document.body.innerHTML = html;
	return window;
}

const read = (window, selectors) => readStyleProbe(window, selectors, styleProperties, 200);

test('probe reports tag, role, attributes, text and requested computed properties per match', async (t) => {
	const window = page(
		'.chip { color: rgb(1, 2, 3); display: inline-grid; font-weight: 600; }',
		'<span class="chip" data-slot="readiness-band-cell" data-tier="good" aria-label="Good">92%</span><span class="chip" data-slot="readiness-band-cell" data-tier="warn">40%</span>'
	);
	t.after(() => window.happyDOM.close());
	const result = read(window, ['[data-slot^="readiness-band"]', '[role="listbox"]']);
	assert.equal(result.theme, 'dark');
	assert.equal(result.viewport.width, 390);
	const [cells, none] = result.selectors;
	assert.equal(cells.count, 2);
	assert.equal(none.count, 0);
	assert.equal(cells.elements[0].tag, 'span');
	assert.equal(cells.elements[0].text, '92%');
	assert.equal(cells.elements[0].attributes['data-tier'], 'good');
	assert.equal(cells.elements[0].attributes['aria-label'], 'Good');
	assert.equal(cells.elements[0].attributes.class, undefined);
	assert.equal(cells.elements[0].style.color, 'rgb(1, 2, 3)');
	assert.equal(cells.elements[0].style.display, 'inline-grid');
	assert.equal(cells.elements[0].style['font-weight'], '600');
});

test('probe leaves the page unchanged and survives an invalid selector', async (t) => {
	const window = page('', '<div data-slot="x" role="listbox"></div>');
	t.after(() => window.happyDOM.close());
	const before = window.document.documentElement.outerHTML;
	const result = read(window, ['[[bad', '[role="listbox"]']);
	assert.equal(result.selectors[0].error, 'invalid selector');
	assert.equal(result.selectors[1].elements[0].role, 'listbox');
	assert.equal(window.document.documentElement.outerHTML, before);
});

test('diff is empty for identical reads and names each changed style, role, text and count', async (t) => {
	const window = page(
		'.a { color: rgb(1, 2, 3); } .b { color: rgb(9, 9, 9); }',
		'<div class="a" data-slot="route-tab" role="tab">One</div><div class="a" data-slot="route-tab">Two</div>'
	);
	t.after(() => window.happyDOM.close());
	const selectors = ['[data-slot="route-tab"]'];
	const before = read(window, selectors);
	assert.deepEqual(diffStyleProbes(before, read(window, selectors)), []);

	window.document.querySelectorAll('div')[0].className = 'b';
	window.document.querySelectorAll('div')[0].removeAttribute('role');
	window.document.querySelectorAll('div')[1].textContent = 'Three';
	window.document.body.append(window.document.createElement('div'));
	window.document.body.lastChild.setAttribute('data-slot', 'route-tab');
	const fields = diffStyleProbes(before, read(window, selectors)).map((d) => `${d.index}:${d.field}`);
	assert.deepEqual(fields.sort(), ['0:attr:role', '0:role', '0:style:color', '1:text', 'null:count'].sort());
});

test('diff reports a selector missing from the later read', () => {
	const before = { selectors: [{ selector: 'main', count: 1, elements: [] }] };
	assert.deepEqual(diffStyleProbes(before, { selectors: [] }), [
		{ selector: 'main', index: null, field: 'selector', was: 'present', now: 'absent' }
	]);
});
