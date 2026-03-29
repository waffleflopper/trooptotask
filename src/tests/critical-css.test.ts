import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

/**
 * Regression tests: critical CSS must be inlined in app.html so that
 * design tokens and base resets are available before any external stylesheet loads.
 * The non-critical stylesheet must be deferred (not render-blocking).
 * This prevents a flash of unstyled content on slow networks (e.g. NIPR).
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

	it('app.html contains an inline <style> block with CSS custom properties', () => {
		expect(inlineStyles).toContain('--color-primary');
	});

	it('app.html inlines dark mode design tokens', () => {
		expect(inlineStyles).toContain("[data-theme='dark']");
	});

	it('app.html inlines base element resets', () => {
		expect(inlineStyles).toContain('box-sizing: border-box');
	});

	it('app.css no longer contains the :root design token block (no duplication)', () => {
		const css = readFileSync(APP_CSS, 'utf-8');
		expect(css).not.toContain('--color-primary:');
	});
});

describe('non-critical CSS deferral', () => {
	it('root layout does not statically import app.css (render-blocking)', () => {
		const layout = readFileSync(ROOT_LAYOUT, 'utf-8');
		expect(layout).not.toMatch(/import\s+['"]\.\.\/app\.css['"]/);
	});

	it('root layout loads non-critical CSS via deferred ?url mechanism', () => {
		const layout = readFileSync(ROOT_LAYOUT, 'utf-8');
		expect(layout).toContain('app.css?url');
	});
});
