// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { navigateWithoutRefreshOnSameUrlClick } from './sameUrlLinkClick';

const { goto } = vi.hoisted(() => ({ goto: vi.fn() }));
vi.mock('$app/navigation', () => ({ goto }));

const current = '/org/alpha/calendar';
let stopped: boolean | undefined;

function guardedClick(event: MouseEvent) {
	navigateWithoutRefreshOnSameUrlClick(event);
	stopped = event.defaultPrevented;
	// The test DOM would otherwise follow the link.
	event.preventDefault();
}

function click(attributes: Record<string, string>, init: MouseEventInit = {}) {
	const link = document.createElement('a');
	for (const [name, value] of Object.entries(attributes)) link.setAttribute(name, value);
	const label = document.createElement('span');
	link.append(label);
	document.body.append(link);
	label.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ...init }));
	return stopped;
}

beforeEach(() => {
	stopped = undefined;
	goto.mockClear();
	vi.stubGlobal('location', new URL(new URL(current, document.baseURI).href));
	document.body.addEventListener('click', guardedClick);
});
afterEach(() => {
	document.body.removeEventListener('click', guardedClick);
	document.body.replaceChildren();
	vi.unstubAllGlobals();
});

it('navigates without a refresh on a plain click on a link to the current URL', () => {
	expect(click({ href: current })).toBe(true);
	expect(goto).toHaveBeenCalledExactlyOnceWith(new URL(current, document.baseURI).href, {
		replace: true,
		reset: true
	});
});

it('keeps focus and scroll when the link opts out of the reset', () => {
	click({ href: current, 'data-sveltekit-reset': 'false' });
	expect(goto).toHaveBeenCalledExactlyOnceWith(new URL(current, document.baseURI).href, {
		replace: true,
		reset: false
	});
});

it.each([
	['another page', { href: '/org/alpha/personnel' }, {}],
	['the same path with other search params', { href: `${current}?view=week` }, {}],
	['a hash on the current page', { href: `${current}#today` }, {}],
	['a new tab target', { href: current, target: '_blank' }, {}],
	['a download', { href: current, download: 'calendar.csv' }, {}],
	['an explicit reload', { href: current, 'data-sveltekit-reload': '' }, {}],
	['a modified click', { href: current }, { ctrlKey: true }],
	['a middle click', { href: current }, { button: 1 }]
])('leaves %s to the browser and router', (_name, attributes, init) => {
	expect(click(attributes, init)).toBe(false);
	expect(goto).not.toHaveBeenCalled();
});

it('ignores clicks outside links', () => {
	document.body.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
	expect(stopped).toBe(false);
});
