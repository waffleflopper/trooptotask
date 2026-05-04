import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const currentDir = dirname(fileURLToPath(import.meta.url));
const LANDING_PAGE = resolve(currentDir, '+page.svelte');

function readLandingPage() {
	return readFileSync(LANDING_PAGE, 'utf-8');
}

function getBlock(source: string, selector: string) {
	const start = source.indexOf(`${selector} {`);
	expect(start, `${selector} rule should exist`).toBeGreaterThanOrEqual(0);

	const open = source.indexOf('{', start);
	let depth = 0;

	for (let index = open; index < source.length; index += 1) {
		const char = source[index];

		if (char === '{') depth += 1;
		if (char === '}') depth -= 1;

		if (depth === 0) {
			return source.slice(open + 1, index);
		}
	}

	throw new Error(`Could not find closing brace for ${selector}`);
}

describe('landing page CSS regressions', () => {
	it('keeps proof section text on dark chrome-safe tokens across themes', () => {
		const source = readLandingPage();
		const proofStyles = [
			getBlock(source, '.section-proof'),
			getBlock(source, '.proof__quote'),
			getBlock(source, '.proof__attribution'),
			getBlock(source, '.proof__point'),
			getBlock(source, '.proof__point:first-child'),
			getBlock(source, '.proof__point-text'),
			getBlock(source, '.proof__point-text strong')
		].join('\n');

		expect(proofStyles).toContain('background: var(--color-chrome)');
		expect(proofStyles).toContain('color: var(--color-chrome-text)');
		expect(proofStyles).toContain('var(--color-chrome-text-muted)');
		expect(proofStyles).toContain('var(--color-chrome-border)');
		expect(proofStyles).not.toContain('var(--ink-03)');
	});

	it('turns off the sticky questions sidebar after the mobile layout collapses', () => {
		const source = readLandingPage();
		const mobileLayoutStyles = getBlock(source, '@media (max-width: 900px)');

		expect(mobileLayoutStyles).toContain('.solves__sidebar');
		expect(mobileLayoutStyles).toContain('position: static');
		expect(mobileLayoutStyles).toContain('top: auto');
	});
});
