import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const currentDir = dirname(fileURLToPath(import.meta.url));
const LANDING_PAGE = resolve(currentDir, '+page.svelte');
const PUBLIC_NAV = resolve(currentDir, '../lib/components/public/PublicSiteNav.svelte');

function readLandingPage() {
	return readFileSync(LANDING_PAGE, 'utf-8');
}

function readPublicNav() {
	return readFileSync(PUBLIC_NAV, 'utf-8');
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
	it('keeps dark landing sections on public chrome-safe tokens across themes', () => {
		const source = readLandingPage();
		const darkSectionStyles = [
			getBlock(source, '.hero'),
			getBlock(source, '.cta-final'),
			getBlock(source, '.hero__body'),
			getBlock(source, '.hero__meta'),
			getBlock(source, '.cta-final__body'),
			getBlock(source, '.cta-final__meta')
		].join('\n');

		expect(darkSectionStyles).toContain('background: var(--hero-bg)');
		expect(darkSectionStyles).toContain('color: var(--hero-text)');
		expect(darkSectionStyles).toContain('color: var(--hero-muted)');
		expect(darkSectionStyles).not.toContain('#12110f');
		expect(darkSectionStyles).not.toContain('#f0efe9');
		expect(darkSectionStyles).not.toContain('#b0afa8');
	});

	it('keeps amber CTA text readable when global link hover styles apply', () => {
		const source = readLandingPage();
		const navSource = readPublicNav();
		const buttonHoverStyles = [
			getBlock(source, 'a.btn-amber:hover'),
			getBlock(navSource, '.nav-button.nav-button-amber:hover')
		].join('\n');

		expect(buttonHoverStyles).toContain('color: var(--color-chrome)');
	});

	it('stacks landing actions after the mobile layout collapses', () => {
		const source = readLandingPage();
		const mobileLayoutStyles = getBlock(source, '@media (max-width: 640px)');

		expect(mobileLayoutStyles).toContain('.hero__actions');
		expect(mobileLayoutStyles).toContain('.cta-final__actions');
		expect(mobileLayoutStyles).toContain('flex-direction: column');
	});
});
