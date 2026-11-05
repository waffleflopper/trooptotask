import type { AddressInfo } from 'node:net';
import { fileURLToPath } from 'node:url';
import { createServer, type ViteDevServer } from 'vite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

let server: ViteDevServer;
let origin: string;
let first: RenderedPage;

interface RenderedPage {
	status: number;
	directives: Map<string, string[]>;
	inlineScriptNonces: (string | null)[];
}

async function render(path: string): Promise<RenderedPage> {
	const response = await fetch(origin + path);
	const directives = new Map(
		(response.headers.get('Content-Security-Policy') ?? '').split(';').map((directive) => {
			const [name, ...sources] = directive.trim().split(/\s+/);
			return [name, sources];
		})
	);
	const html = await response.text();
	const inlineScriptNonces = [...html.matchAll(/<script(?![^>]*\ssrc=)([^>]*)>/g)].map(
		([, attributes]) => /\snonce="([^"]+)"/.exec(attributes)?.[1] ?? null
	);
	return { status: response.status, directives, inlineScriptNonces };
}

// SvelteKit renders through the app's real config and hooks; the first server render compiles them, which is slow.
beforeAll(async () => {
	server = await createServer({
		configFile: fileURLToPath(new URL('../vite.config.ts', import.meta.url)),
		logLevel: 'silent',
		server: { host: '127.0.0.1', port: 0, hmr: false, watch: null }
	});
	await server.listen();
	origin = `http://127.0.0.1:${(server.httpServer?.address() as AddressInfo).port}`;
	first = await render('/auth/login');
}, 300_000);

afterAll(() => server?.close());

describe('Content Security Policy on a rendered page', () => {
	it('runs only inline scripts that carry the response nonce, with a fresh nonce per response', async () => {
		const second = await render('/auth/login');

		expect(first.status).toBe(200);
		const scriptSources = first.directives.get('script-src') ?? [];
		expect(scriptSources).not.toContain("'unsafe-inline'");
		expect(scriptSources).not.toContain("'unsafe-eval'");
		const nonce = scriptSources.find((source) => source.startsWith("'nonce-"))?.slice(7, -1);
		expect(nonce).toMatch(/^[A-Za-z0-9+/=]{16,}$/);
		expect(first.inlineScriptNonces.length).toBeGreaterThan(0);
		expect(first.inlineScriptNonces.every((value) => value === nonce)).toBe(true);
		expect(second.directives.get('script-src')).not.toContain(`'nonce-${nonce}'`);
	});

	it('forbids framing, foreign base URLs, foreign form targets and plugins', () => {
		expect(first.directives.get('frame-ancestors')).toEqual(["'none'"]);
		expect(first.directives.get('base-uri')).toEqual(["'self'"]);
		expect(first.directives.get('form-action')).toEqual(["'self'"]);
		expect(first.directives.get('object-src')).toEqual(["'none'"]);
	});

	it('gives the browser no provider origin to connect to', () => {
		// The browser has no provider client; only the server talks to Supabase.
		expect(first.directives.get('connect-src')).toEqual(["'self'", 'https://vitals.vercel-insights.com']);
	});
});
