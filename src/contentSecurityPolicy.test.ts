import { describe, expect, it } from 'vitest';
import { kitCsp } from '../vite.config';

describe('Content Security Policy configured for SvelteKit', () => {
	const directives = kitCsp.directives;

	it('lets SvelteKit nonce the scripts of server-rendered pages', () => {
		expect(kitCsp.mode).toBe('auto');
	});

	it('runs only same-origin and analytics scripts, never inline or eval code', () => {
		expect(directives['script-src']).toEqual(['self', 'https://va.vercel-scripts.com']);
	});

	it('forbids framing, foreign base URLs, foreign form targets and plugins', () => {
		expect(directives['frame-ancestors']).toEqual(['none']);
		expect(directives['base-uri']).toEqual(['self']);
		expect(directives['form-action']).toEqual(['self']);
		expect(directives['object-src']).toEqual(['none']);
	});

	it('gives the browser no provider origin to connect to', () => {
		expect(directives['connect-src']).toEqual(['self', 'https://vitals.vercel-insights.com']);
	});
});
