import { puppeteer } from '../../node_modules/chrome-devtools-mcp/build/src/third_party/index.js';
import { Blocked } from './core.mjs';
import { ownedPrintEndpoint } from './print-capture.mjs';

const fail = (code, message) => {
	throw new Blocked(code, message);
};
const usage = 'Use pointer drag|touch PAGE EXACT_URL FROM_SELECTOR TO_SELECTOR [STEPS].';

function dragInput(input, origin) {
	if (
		!input ||
		Object.keys(input).some(
			(key) => !['command', 'pageId', 'expectedUrl', 'from', 'to', 'steps', 'device'].includes(key)
		) ||
		input.command !== 'pointer-drag' ||
		![undefined, 'mouse', 'touch'].includes(input.device) ||
		!Number.isSafeInteger(input.pageId) ||
		input.pageId < 1 ||
		typeof input.expectedUrl !== 'string' ||
		[input.from, input.to].some((selector) => typeof selector !== 'string' || !selector || selector.length > 300) ||
		(input.steps !== undefined && (!Number.isSafeInteger(input.steps) || input.steps < 1 || input.steps > 50))
	)
		fail('DRAG_INPUT', usage);
	let url;
	try {
		url = new URL(input.expectedUrl);
	} catch {
		fail('DRAG_URL', 'Expected URL must be an exact owned app URL.');
	}
	if (url.origin !== origin || url.href !== input.expectedUrl) fail('DRAG_URL', 'Use a loaded URL in this owned app.');
	return { ...input, steps: input.steps ?? 10, device: input.device ?? 'mouse' };
}

/**
 * Drags with real trusted pointer input from the centre of one element to the centre of another. The native
 * `drag` tool needs snapshot UIDs, which aria-hidden pointer-only targets such as resize grips never get, and it
 * only sends mouse input. A touch from an element to itself is a tap.
 */
export async function pointerDrag(
	{ state, session, input, call },
	{ inspectOwnership = ownedPrintEndpoint, connect = (options) => puppeteer.connect(options) } = {}
) {
	const request = dragInput(input, state.origin);
	const endpoint = await inspectOwnership(state, session);
	const pages = (await call('list_pages', {})).structuredContent?.pages;
	const native = Array.isArray(pages) ? pages.filter((page) => page.url === request.expectedUrl) : [];
	if (native.length !== 1 || native[0].id !== request.pageId)
		fail('DRAG_PAGE', 'Native page ID and unique exact URL must agree.');
	const browser = await connect({ browserWSEndpoint: endpoint, defaultViewport: null });
	try {
		const matches = (await browser.pages()).filter((page) => !page.isClosed() && page.url() === request.expectedUrl);
		if (matches.length !== 1) fail('DRAG_PAGE', 'The URL must identify one live owned page.');
		const page = matches[0];
		const [width, height] = await page.evaluate(() => [innerWidth, innerHeight]);
		const centre = async (selector) => {
			const handles = await page.$$(selector);
			if (handles.length !== 1) fail('DRAG_TARGET', `${selector} must match exactly one element.`);
			const box = await handles[0].boundingBox();
			if (!box || box.width === 0 || box.height === 0) fail('DRAG_TARGET', `${selector} is not rendered.`);
			const point = { x: Math.round(box.x + box.width / 2), y: Math.round(box.y + box.height / 2) };
			if (point.x < 0 || point.y < 0 || point.x >= width || point.y >= height)
				fail('DRAG_TARGET', `${selector} is outside the viewport; scroll it into view first.`);
			return point;
		};
		const from = await centre(request.from);
		const to = await centre(request.to);
		if (request.device === 'touch') {
			const touch = await page.touchscreen.touchStart(from.x, from.y);
			if (from.x !== to.x || from.y !== to.y) {
				for (let step = 1; step <= request.steps; step++) {
					await touch.move(
						Math.round(from.x + ((to.x - from.x) * step) / request.steps),
						Math.round(from.y + ((to.y - from.y) * step) / request.steps)
					);
				}
			}
			await touch.end();
		} else {
			await page.mouse.move(from.x, from.y);
			await page.mouse.down();
			await page.mouse.move(to.x, to.y, { steps: request.steps });
			await page.mouse.up();
		}
		return {
			status: 'PASS',
			pageId: request.pageId,
			url: request.expectedUrl,
			from: { selector: request.from, ...from },
			to: { selector: request.to, ...to },
			steps: request.steps,
			device: request.device
		};
	} finally {
		await Promise.resolve(browser.disconnect()).catch(() => {});
	}
}
