import { randomUUID } from 'node:crypto';
import { Blocked } from './core.mjs';
import { textContent } from './browser.mjs';

const fail = (code, message) => {
	throw new Blocked(code, message);
};

export function authCookieName(providerUrl) {
	return `sb-${new URL(providerUrl).hostname.split('.')[0]}-auth-token`;
}

/**
 * The cookie the app's sign-in action stores for a provider session: the session without its user,
 * under the app's auth cookie options. Browsers accept Secure cookies from the loopback origin.
 */
export function sessionCookie(origin, providerUrl, grant, now = Date.now()) {
	const { user: _user, ...stored } = grant;
	return {
		name: authCookieName(providerUrl),
		value: `base64-${Buffer.from(JSON.stringify(stored)).toString('base64url')}`,
		domain: new URL(origin).hostname,
		path: '/',
		httpOnly: true,
		secure: true,
		sameSite: 'Lax',
		expires: Math.floor(now / 1000) + 400 * 24 * 60 * 60
	};
}

/** Where the sign-in action redirects: a verified authenticator still owes its code. */
export function entryPath(grant, destination) {
	return grant.user?.factors?.some((factor) => factor.status === 'verified')
		? `/auth/mfa-verify?next=${encodeURIComponent(destination)}`
		: destination;
}

/** `actor --form ROLE ...` signs in through the visible form; plain `actor ROLE ...` uses a provider session. */
export function actorArguments(args) {
	return args[0] === '--form' ? { form: true, args: args.slice(1) } : { form: false, args };
}

/**
 * Opens a page in a new isolated context, signs the actor in at the disposable provider and stores
 * that genuine session as the app's auth cookie, without spending the app's `/auth/` request budget.
 * The page starts on the static image the cold perf samples need; the caller navigates it.
 */
export async function sessionPage(
	{ state, session, input, call, provider },
	{
		// Loaded on use: these bring the DevTools client, which only this command needs.
		inspectOwnership = async (...args) => (await import('./print-capture.mjs')).ownedPrintEndpoint(...args),
		connect = async (options) =>
			(await import('../../node_modules/chrome-devtools-mcp/build/src/third_party/index.js')).puppeteer.connect(
				options
			),
		fetch = globalThis.fetch
	} = {}
) {
	const { email, password, destination, isolatedContext } = input ?? {};
	if (
		[email, password, isolatedContext].some((value) => typeof value !== 'string' || !value) ||
		typeof destination !== 'string' ||
		!destination.startsWith('/') ||
		destination.startsWith('//')
	)
		fail('SESSION_INPUT', 'Use session-page with synthetic credentials, a context name and an app path.');
	const response = await fetch(`${provider.API_URL}/auth/v1/token?grant_type=password`, {
		method: 'POST',
		headers: { apikey: provider.ANON_KEY, 'Content-Type': 'application/json' },
		body: JSON.stringify({ email, password })
	});
	const grant = await response.json().catch(() => null);
	if (!response.ok || typeof grant?.access_token !== 'string')
		fail('PROVIDER_SESSION', `Provider sign-in failed (HTTP ${response.status}).`);
	const url = `${state.origin}/og-image.png?session=${randomUUID()}`;
	const created = textContent(await call('new_page', { url, isolatedContext }));
	const pageId = Number(
		created
			.split('\n')
			.find((line) => line.includes('[selected]'))
			?.match(/^(\d+):/)?.[1]
	);
	if (!Number.isInteger(pageId)) fail('PAGE_ID', 'DevTools did not return a page ID; inspect new_page response.');
	const browser = await connect({ browserWSEndpoint: await inspectOwnership(state, session), defaultViewport: null });
	try {
		const pages = (await browser.pages()).filter((page) => page.url() === url);
		if (pages.length !== 1) fail('SESSION_PAGE', 'The new page could not be identified in the owned browser.');
		await pages[0].browserContext().setCookie(sessionCookie(state.origin, provider.API_URL, grant));
	} finally {
		await Promise.resolve(browser.disconnect()).catch(() => {});
	}
	return { status: 'PASS', pageId, path: entryPath(grant, destination) };
}
