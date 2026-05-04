import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

/**
 * Regression tests: design tokens and base resets are inlined in app.html,
 * and app.css is statically imported in the root layout so all styles are
 * SSR-delivered. This prevents unstyled flashes on slow networks (e.g. NIPR).
 */

const currentDir = dirname(fileURLToPath(import.meta.url));
const APP_HTML = resolve(currentDir, '../../src/app.html');
const APP_CSS = resolve(currentDir, '../../src/app.css');
const ROOT_LAYOUT = resolve(currentDir, '../routes/+layout.svelte');

function getInlineStyles(html: string): string {
	const match = html.match(/<style[^>]*>([\s\S]*?)<\/style>/);
	return match ? match[1] : '';
}

describe('critical CSS inlining', () => {
	const html = readFileSync(APP_HTML, 'utf-8');
	const inlineStyles = getInlineStyles(html);

	it('app.html includes first-paint theme and base fallback styles', () => {
		expect(inlineStyles).toContain('color-scheme: light');
		expect(inlineStyles).toContain('background: #f8f7f4');
		expect(inlineStyles).toContain("[data-theme='dark']");
		expect(inlineStyles).toContain('min-height: 100%');
		expect(inlineStyles).toContain('margin: 0');
	});

	it('app.css no longer carries migration alias definitions', () => {
		const css = readFileSync(APP_CSS, 'utf-8');
		expect(css).not.toContain('Migration aliases');
		expect(css).not.toContain('--color-primary:');
		expect(css).not.toContain('--color-bg:');
	});
});

describe('global CSS loading', () => {
	it('root layout statically imports app.css so styles are SSR-delivered', () => {
		const layout = readFileSync(ROOT_LAYOUT, 'utf-8');
		expect(layout).toMatch(/import\s+['"]\.\.\/app\.css['"]/);
	});
});
