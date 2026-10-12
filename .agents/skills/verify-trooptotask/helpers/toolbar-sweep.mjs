// Width sweep of a workspace toolbar. `readToolbar` runs inside the owned page and only observes;
// `checkSweep` judges the saved reads in Node; `runSweep` drives resizes through an injected page API.

export const restoreViewport = { width: 1280, height: 800 };
const holdMs = 250;
const holdReads = 3;

// Runs in the owned page. Reads layout and keeps one MutationObserver on the toolbar root that counts
// per-id membership changes between reads; it never writes to the app's DOM or state.
export function readToolbar(target, label) {
	const document = target.document;
	const roots = [...document.querySelectorAll('[role="toolbar"]')].filter(
		(n) => n.getAttribute('aria-label') === label
	);
	if (roots.length !== 1) throw new Error(`Expected one toolbar named ${label}, found ${roots.length}.`);
	const root = roots[0];
	const row = root.querySelector('[data-toolbar-row]');
	const base = { viewportWidth: target.innerWidth, viewportHeight: target.innerHeight };
	if (!row) {
		const controls = [...root.querySelectorAll('button, a[href], input, [role="combobox"]')];
		const centres = controls.map((n) => {
			const r = n.getBoundingClientRect();
			return Math.round((r.top + r.bottom) / 2);
		});
		return {
			...base,
			fitted: false,
			reason: 'toolbar has no data-toolbar-row; not a fitted toolbar',
			rootClientWidth: root.clientWidth,
			rootScrollWidth: root.scrollWidth,
			tops: [...new Set(centres)].sort((a, b) => a - b),
			controls: controls.map(
				(n) =>
					n.getAttribute('aria-label') || (n.textContent ?? '').replace(/\s+/g, ' ').trim() || n.tagName.toLowerCase()
			)
		};
	}
	const liveItems = () =>
		[...row.querySelectorAll('[data-toolbar-item]')].filter((n) => !n.closest('[data-toolbar-measure]'));
	const liveIds = () => liveItems().map((n) => n.getAttribute('data-toolbar-item'));

	const known = target.__toolbarSweep;
	const remounted = Boolean(known) && known.root !== root;
	if (!known || remounted) {
		known?.observer.disconnect();
		const counter = { root, last: new Set(liveIds()), counts: {}, observer: null };
		counter.observer = new target.MutationObserver(() => {
			const now = new Set(liveIds());
			for (const id of new Set([...counter.last, ...now]))
				if (counter.last.has(id) !== now.has(id)) counter.counts[id] = (counter.counts[id] ?? 0) + 1;
			counter.last = now;
		});
		counter.observer.observe(root, { childList: true, subtree: true, attributes: true });
		target.__toolbarSweep = counter;
	}
	const counter = target.__toolbarSweep;
	const flips = counter.counts;
	counter.counts = {};

	const style = target.getComputedStyle(row);
	const pad = (side) => parseFloat(style.getPropertyValue(`padding-${side}`)) || 0;
	const rowRect = row.getBoundingClientRect();
	const contentLeft = rowRect.left + row.clientLeft + pad('left');
	const contentWidth = row.clientWidth - pad('left') - pad('right');
	const contentRight = contentLeft + contentWidth;
	const parts = [
		...liveItems().map((n) => [n.getAttribute('data-toolbar-item'), n]),
		...[...root.querySelectorAll('[data-toolbar-more]')]
			.filter((n) => !n.closest('[data-toolbar-measure]'))
			.map((n) => ['more', n]),
		// Everything else on the row is the live search control: the field, the icon, or the open field and Close.
		...[...row.children].filter((n) => !n.matches('[data-toolbar-item], [data-toolbar-more]')).map((n) => ['search', n])
	];
	const boxes = parts.map(([id, n]) => ({ id, rect: n.getBoundingClientRect() }));
	// Rows compare by vertical centre: a 32px button beside a 36px field has different tops on one row.
	const centres = boxes.map(({ rect }) => (rect.top + rect.bottom) / 2).sort((a, b) => a - b);
	const rows = [];
	for (const centre of centres) if (!rows.length || centre - rows[rows.length - 1] > 8) rows.push(centre);
	return {
		...base,
		fitted: true,
		ids: liveIds(),
		more: parts.some(([id]) => id === 'more'),
		search: root.getAttribute('data-toolbar-search'),
		ready: root.getAttribute('data-toolbar-ready'),
		contentWidth,
		rowCount: rows.length,
		tops: rows.map((c) => Math.round(c)),
		clipped: boxes
			.filter(({ rect }) => rect.left < contentLeft - 0.5 || rect.right > contentRight + 0.5)
			.map(({ id }) => id),
		rowClientWidth: row.clientWidth,
		rowScrollWidth: row.scrollWidth,
		rootClientWidth: root.clientWidth,
		rootScrollWidth: root.scrollWidth,
		flips,
		remounted
	};
}

// Source for one settled read: fonts loaded, two animation frames, then the pure read, on the owned origin only.
export function toolbarReadSource(label, origin) {
	return `async () => {
		if (location.origin !== ${JSON.stringify(origin)}) throw new Error('Use an owned app page');
		await document.fonts?.ready;
		await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
		return (${readToolbar.toString()})(window, ${JSON.stringify(label)});
	}`;
}

const tolerance = 0.5;
const signature = (read) => `${read.ids.join(',')}|${read.search}|${read.more}`;
const widthKey = (read) => String(Math.round(read.contentWidth * 2) / 2);

// Pure. `down` and `up` are steps `{ width, read, holds }`; `expect` lists the ids in the order they must fold.
export function checkSweep({ down, up }, { expect }) {
	const failures = [];
	const fail = (check, width, detail) => failures.push({ check, width, detail });
	const steps = [
		...down.map((step) => ({ ...step, direction: 'down' })),
		...up.map((step) => ({ ...step, direction: 'up' }))
	];
	const unfitted = steps.find((step) => step.read?.fitted === false);
	if (unfitted) {
		fail('fitted', unfitted.width, unfitted.read.reason);
		return { ok: false, failures, foldedAt: {}, restoredAt: {} };
	}
	if (!down.length) {
		fail('trace', null, 'The sweep recorded no downward steps.');
		return { ok: false, failures, foldedAt: {}, restoredAt: {} };
	}

	const pinned = down[0].read.ids.filter((id) => !expect.includes(id));
	const foldedIn = (read) => expect.filter((id) => !read.ids.includes(id));
	const missing = expect.filter((id) => !down[0].read.ids.includes(id));
	if (missing.length)
		fail('start-all-fit', down[0].width, `The sweep starts without ${missing.join(', ')} on the row; raise --from.`);

	for (const step of steps) {
		const { read, width } = step;
		if (read.viewportWidth !== width)
			fail('resize', width, `Asked for ${width}px, the page reports ${read.viewportWidth}px.`);
		if (read.ready !== 'true') fail('ready', width, `data-toolbar-ready is ${read.ready}.`);
		if (read.remounted) fail('remount', width, 'The toolbar root was replaced during the sweep.');
		if (read.rowCount !== 1)
			fail('one-row', width, `${read.rowCount} rows at vertical centres ${read.tops.join(', ')}.`);
		if (
			read.rowScrollWidth > read.rowClientWidth + tolerance ||
			read.rootScrollWidth > read.rootClientWidth + tolerance
		)
			fail(
				'no-overflow',
				width,
				`row ${read.rowScrollWidth}/${read.rowClientWidth}, root ${read.rootScrollWidth}/${read.rootClientWidth}.`
			);
		if (read.clipped.length)
			fail('inside-row', width, `${read.clipped.join(', ')} extend outside the row's content box.`);
		for (const id of pinned.filter((p) => !read.ids.includes(p))) fail('pinned', width, `${id} left the row.`);

		const folded = foldedIn(read);
		if (folded.join() !== expect.slice(0, folded.length).join())
			fail('order', width, `Folded ${folded.join(', ') || 'nothing'}; the order is ${expect.join(', ')}.`);
		if (read.more !== folded.length > 0)
			fail('more', width, `More is ${read.more ? 'present' : 'absent'} with ${folded.length} folded.`);
		if (read.search === 'icon' && folded.length < expect.length)
			fail(
				'search',
				width,
				`Search is an icon while ${expect.filter((id) => read.ids.includes(id)).join(', ')} still on the row.`
			);

		const flipped = {};
		for (const part of [read, ...step.holds])
			for (const [id, count] of Object.entries(part.flips ?? {})) flipped[id] = (flipped[id] ?? 0) + count;
		for (const [id, count] of Object.entries(flipped))
			if (count > 1) fail('flips', width, `${id} changed membership ${count} times in one step.`);
		for (const [index, hold] of step.holds.entries())
			if (signature(hold) !== signature(read))
				fail('stable', width, `Hold read ${index + 1} is ${signature(hold)}, the first read was ${signature(read)}.`);
	}

	const foldedAt = {};
	const restoredAt = {};
	for (const direction of ['down', 'up']) {
		const list = steps.filter((step) => step.direction === direction);
		for (let i = 1; i < list.length; i++) {
			const before = list[i - 1].read.ids;
			const now = list[i].read.ids;
			const removed = before.filter((id) => !now.includes(id));
			const added = now.filter((id) => !before.includes(id));
			const width = list[i].width;
			for (const id of removed) foldedAt[id] ??= width;
			if (direction === 'up') for (const id of added) restoredAt[id] = width;
			// The toolbar fits its own row, and the shell can change the row's width without the viewport moving
			// the same way (the sidebar docks at 768px). Judge direction by the row's content width.
			const rowDelta = list[i].read.contentWidth - list[i - 1].read.contentWidth;
			const jump = Math.abs(rowDelta - (width - list[i - 1].width)) > tolerance;
			const wrong = rowDelta > tolerance ? removed : rowDelta < -tolerance ? added : [...removed, ...added];
			if (wrong.length)
				fail(
					'direction',
					width,
					`${wrong.join(', ')} ${rowDelta > tolerance ? 'left while the row widened' : rowDelta < -tolerance ? 'came back while the row narrowed' : 'changed at the same row width'} going ${direction}.`
				);
			const moved = rowDelta > tolerance ? added : removed;
			if (moved.length > 1 && !jump)
				fail(
					'one-at-a-time',
					width,
					`${moved.join(', ')} ${direction === 'down' ? 'folded' : 'restored'} in one step.`
				);
		}
	}

	const seen = new Map();
	for (const step of steps) {
		const key = widthKey(step.read);
		const previous = seen.get(key);
		if (!previous) seen.set(key, { sig: signature(step.read), width: step.width, direction: step.direction });
		else if (previous.sig !== signature(step.read))
			fail(
				'same-width',
				step.width,
				`Content width ${key}px read ${signature(step.read)} (${step.direction}) and ${previous.sig} (${previous.direction} at ${previous.width}px).`
			);
	}
	return { ok: failures.length === 0, failures, foldedAt, restoredAt };
}

export function sweepWidths(from, to, step) {
	const widths = [];
	for (let w = from; w > to; w -= step) widths.push(w);
	widths.push(to);
	return widths;
}

// `page` is `{ resize(width, height), read(), startRecording(file), stopRecording() }`. The recording stops,
// the viewport returns to 1280x800 and the trace is written even when the drive throws.
export async function runSweep({ page, expect, from, to, step, height, recording, write, sleep, progress = () => {} }) {
	const result = { expect, from, to, step, height, recording: null, error: null, down: [], up: [] };
	const widths = sweepWidths(from, to, step);
	let previous;
	const measure = async (width) => {
		await page.resize(width, height);
		const read = await page.read();
		const holds = [];
		if (previous && read.fitted && previous.fitted && signature(read) !== signature(previous)) {
			await sleep(holdMs);
			for (let i = 0; i < holdReads; i++) holds.push(await page.read());
		}
		previous = read;
		return { width, read, holds };
	};
	try {
		await page.resize(from, height);
		if (recording) {
			await page.startRecording(recording);
			result.recording = { file: recording, stopped: false };
		}
		previous = await page.read();
		for (const [index, width] of widths.entries()) {
			result.down.push(await measure(width));
			if (index % 100 === 0) progress(`down ${width}px`);
		}
		for (const [index, width] of [...widths].reverse().slice(1).entries()) {
			result.up.push(await measure(width));
			if (index % 100 === 0) progress(`up ${width}px`);
		}
	} catch (error) {
		result.error = error.message;
	} finally {
		if (result.recording) {
			try {
				await page.stopRecording();
				result.recording.stopped = true;
			} catch (error) {
				result.recording.stopError = error.message;
			}
		}
		try {
			await page.resize(restoreViewport.width, restoreViewport.height);
		} catch (error) {
			result.restoreError = error.message;
		}
		result.verdict = result.down.length
			? checkSweep(result, { expect })
			: { ok: false, failures: [], foldedAt: {}, restoredAt: {} };
		if (result.error)
			result.verdict = {
				...result.verdict,
				ok: false,
				failures: [{ check: 'aborted', width: null, detail: result.error }, ...result.verdict.failures]
			};
		if (result.recording && !result.recording.stopped)
			result.verdict = {
				...result.verdict,
				ok: false,
				failures: [...result.verdict.failures, { check: 'recording', width: null, detail: result.recording.stopError }]
			};
		await write(result);
	}
	return result;
}
