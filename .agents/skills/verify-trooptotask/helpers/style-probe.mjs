// Read-only computed-style probe for equivalence checks across a styling migration.
// `readStyleProbe` runs inside the owned page; `diffStyleProbes` compares two saved reads in Node.

export const styleProperties = [
	'background-color',
	'background-image',
	'color',
	'border-top-color',
	'border-right-color',
	'border-bottom-color',
	'border-left-color',
	'border-top-width',
	'border-right-width',
	'border-bottom-width',
	'border-left-width',
	'border-top-left-radius',
	'box-shadow',
	'width',
	'height',
	'max-width',
	'display',
	'gap',
	'padding',
	'font-family',
	'font-size',
	'font-weight',
	'opacity',
	'outline-style',
	'fill',
	'stroke',
	'stroke-width',
	'stroke-dasharray'
];

export const defaultStyleSelectors = [
	'main',
	'[data-slot^="type-management-workspace"]',
	'[data-slot^="bulk-import-"]',
	'[data-slot^="readiness-band"]',
	'[data-slot="chart"]',
	'[data-slot="chart"] svg *',
	'[data-slot="badge"]',
	'[data-slot="route-tabs"]',
	'[data-slot="route-tab"]',
	'[data-slot^="workspace-toolbar"]',
	'[data-slot="workspace-toolbar"] [data-slot="select-trigger"]',
	'[data-slot="workspace-toolbar"] [data-slot="input-group"]',
	'[data-slot="workspace-toolbar"] [data-workspace-toolbar-action-label]',
	'[data-slot="empty-title"]',
	'[role="listbox"]',
	'[role="option"]',
	'[role="radiogroup"]',
	'[role="radio"]',
	'details',
	'summary',
	'main svg',
	'main svg path',
	'main svg rect',
	'main svg line',
	'main svg circle',
	'main svg text',
	'main h1',
	'main h2',
	'main h3',
	'[data-slot="empty"]',
	'[role="dialog"]',
	'[data-slot="alert"]'
];

// Runs in the owned page. Pure read: no events, no attribute writes, no scrolling.
export function readStyleProbe(target, selectors, properties, limit) {
	const document = target.document;
	const text = (n) => (n.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 80);
	// SVG geometry stays whole so a reshaped chart mark with the same box still differs.
	const geometry = /^(d|points|viewBox|transform)$/;
	const attributes = (n) =>
		Object.fromEntries(
			[...n.attributes]
				.filter((a) => a.name !== 'class' && a.name !== 'style')
				.map((a) => [a.name, a.value.length > 120 && !geometry.test(a.name) ? a.value.slice(0, 120) + '…' : a.value])
		);
	const entries = [];
	for (const selector of selectors) {
		let nodes;
		try {
			nodes = [...document.querySelectorAll(selector)];
		} catch {
			entries.push({ selector, error: 'invalid selector' });
			continue;
		}
		const elements = nodes.slice(0, limit).map((n, index) => {
			const style = target.getComputedStyle(n);
			const rect = n.getBoundingClientRect();
			return {
				index,
				tag: n.tagName.toLowerCase(),
				role: n.getAttribute('role'),
				text: text(n),
				attributes: attributes(n),
				rect: { width: Math.round(rect.width * 100) / 100, height: Math.round(rect.height * 100) / 100 },
				style: Object.fromEntries(properties.map((p) => [p, style.getPropertyValue(p)]))
			};
		});
		entries.push({ selector, count: nodes.length, elements });
	}
	return {
		url: target.location.pathname + target.location.search,
		viewport: { width: target.innerWidth, height: target.innerHeight },
		theme: document.documentElement.dataset.theme ?? null,
		prefersDark: target.matchMedia('(prefers-color-scheme: dark)').matches,
		title: document.title,
		selectors: entries
	};
}

// Extra selectors add to the defaults; a repeated selector is read once.
export function resolveStyleSelectors(extras = []) {
	return [...new Set([...defaultStyleSelectors, ...extras])];
}

// Reads from a different page, viewport or theme are not comparable, so those differences
// come first. Elements pair by selector and index. A selector read by only one side, a changed
// count, text or attribute shows the page state differed or a role/name changed; a changed
// style property shows a visual change.
export function diffStyleProbes(before, after, { ignoreAttributes = [] } = {}) {
	const differences = [];
	const note = (selector, index, field, was, now) => differences.push({ selector, index, field, was, now });
	const path = (probe) => probe.url?.split('?')[0];
	const size = (probe) => (probe.viewport ? `${probe.viewport.width}x${probe.viewport.height}` : undefined);
	if (path(before) !== path(after)) note(null, null, 'url', path(before), path(after));
	if (size(before) !== size(after)) note(null, null, 'viewport', size(before), size(after));
	if (before.theme !== after.theme) note(null, null, 'theme', before.theme, after.theme);
	const byselector = new Map(after.selectors.map((entry) => [entry.selector, entry]));
	const known = new Set(before.selectors.map((entry) => entry.selector));
	for (const entry of before.selectors) {
		const other = byselector.get(entry.selector);
		if (!other) {
			note(entry.selector, null, 'selector-removed', 'present', 'absent');
			continue;
		}
		// A selector that failed on either side measured nothing, so it cannot count as equal.
		if (entry.error || other.error) {
			note(entry.selector, null, 'selector-error', entry.error ?? null, other.error ?? null);
			continue;
		}
		if (entry.count !== other.count) note(entry.selector, null, 'count', entry.count, other.count);
		const length = Math.min(entry.elements?.length ?? 0, other.elements?.length ?? 0);
		for (let i = 0; i < length; i++) {
			const a = entry.elements[i];
			const b = other.elements[i];
			for (const field of ['tag', 'role', 'text'])
				if (a[field] !== b[field]) note(entry.selector, i, field, a[field], b[field]);
			for (const key of new Set([...Object.keys(a.attributes), ...Object.keys(b.attributes)])) {
				if (ignoreAttributes.includes(key)) continue;
				if (a.attributes[key] !== b.attributes[key])
					note(entry.selector, i, `attr:${key}`, a.attributes[key], b.attributes[key]);
			}
			for (const key of ['width', 'height'])
				if (a.rect[key] !== b.rect[key]) note(entry.selector, i, `rect:${key}`, a.rect[key], b.rect[key]);
			for (const key of Object.keys(a.style))
				if (a.style[key] !== b.style[key]) note(entry.selector, i, `style:${key}`, a.style[key], b.style[key]);
		}
	}
	for (const entry of after.selectors)
		if (!known.has(entry.selector)) note(entry.selector, null, 'selector-added', 'absent', 'present');
	return differences;
}
