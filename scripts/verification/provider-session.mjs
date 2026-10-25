import { randomUUID } from 'node:crypto';
import { Blocked, environment as ownedEnvironment } from './core.mjs';
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

const MFA_STALE_MINUTES = 11;

function assuranceLevel(grant) {
	try {
		return JSON.parse(Buffer.from(grant.access_token.split('.')[1], 'base64url')).aal;
	} catch {
		return undefined;
	}
}

/** Where the sign-in action redirects: a verified authenticator still owes its code unless the session is aal2. */
export function entryPath(grant, destination) {
	return assuranceLevel(grant) !== 'aal2' && grant.user?.factors?.some((factor) => factor.status === 'verified')
		? `/auth/mfa-verify?next=${encodeURIComponent(destination)}`
		: destination;
}

const ACTOR_FLAGS = ['--form', '--show-whats-new', '--aal1', '--stale-mfa'];

/**
 * `actor --form ROLE ...` signs in through the visible form; plain `actor ROLE ...` uses a provider session.
 * The operator's session is aal2 unless `--aal1` keeps it at the password step or `--stale-mfa` makes its
 * MFA verification older than the 10 minutes a suspension accepts.
 */
export function actorArguments(args) {
	return {
		form: args.includes('--form'),
		showWhatsNew: args.includes('--show-whats-new'),
		aal1: args.includes('--aal1'),
		staleMfa: args.includes('--stale-mfa'),
		args: args.filter((arg) => !ACTOR_FLAGS.includes(arg))
	};
}

async function providerPost(fetch, provider, path, body, bearer = provider.ANON_KEY) {
	const response = await fetch(`${provider.API_URL}${path}`, {
		method: 'POST',
		headers: { apikey: provider.ANON_KEY, Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json' },
		body: JSON.stringify(body)
	});
	const result = await response.json().catch(() => null);
	if (!response.ok || (typeof result?.access_token !== 'string' && typeof result?.id !== 'string'))
		fail('PROVIDER_MFA', `Provider MFA step ${path.split('?')[0]} failed (HTTP ${response.status}).`);
	return result;
}

/** Completes the account's verified TOTP at the provider; `stale` back-dates that verification before refreshing. */
async function elevate(grant, mfa, { provider, session, fetch, environment }) {
	const factor = grant.user.factors?.find((candidate) => candidate.status === 'verified');
	if (!factor) fail('PROVIDER_MFA', 'This synthetic account has no verified authenticator to complete.');
	const challenge = await providerPost(
		fetch,
		provider,
		`/auth/v1/factors/${factor.id}/challenge`,
		{},
		grant.access_token
	);
	const { code } = await environment('totp-code', session, grant.user.id);
	const verified = await providerPost(
		fetch,
		provider,
		`/auth/v1/factors/${factor.id}/verify`,
		{ challenge_id: challenge.id, code },
		grant.access_token
	);
	if (mfa !== 'stale') return verified;
	await environment('mfa-age', session, grant.user.id, MFA_STALE_MINUTES);
	return providerPost(fetch, provider, '/auth/v1/token?grant_type=refresh_token', {
		refresh_token: verified.refresh_token
	});
}

/** The entry the What's New dialog would show first, which dismissing it records as seen. */
export async function newestWhatsNewEntryId(fetch, provider, bearer) {
	const response = await fetch(
		`${provider.API_URL}/rest/v1/whats_new_entries?select=id&published_seq=not.is.null&order=published_seq.desc&limit=1`,
		{ headers: { apikey: provider.ANON_KEY, Authorization: `Bearer ${bearer}` } }
	);
	const entries = await response.json().catch(() => null);
	if (!response.ok || !Array.isArray(entries))
		fail('PROVIDER_WHATS_NEW', `Provider What's New read failed (HTTP ${response.status}).`);
	return entries[0]?.id ?? '';
}

export function whatsNewPreferenceScript(userId, newestEntryId, showWhatsNew = false) {
	const key = `changelog-last-seen-${userId}`;
	return showWhatsNew
		? `() => { localStorage.removeItem(${JSON.stringify(key)}); return true; }`
		: `() => { localStorage.setItem(${JSON.stringify(key)}, ${JSON.stringify(newestEntryId)}); return true; }`;
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
		fetch = globalThis.fetch,
		environment = ownedEnvironment
	} = {}
) {
	const { email, password, destination, isolatedContext, showWhatsNew = false, mfa } = input ?? {};
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
	let grant = await response.json().catch(() => null);
	if (!response.ok || typeof grant?.access_token !== 'string' || typeof grant.user?.id !== 'string')
		fail('PROVIDER_SESSION', `Provider sign-in failed (HTTP ${response.status}).`);
	if (mfa) grant = await elevate(grant, mfa, { provider, session, fetch, environment });
	const newestEntryId = showWhatsNew ? '' : await newestWhatsNewEntryId(fetch, provider, grant.access_token);
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
		await pages[0].evaluate(`(${whatsNewPreferenceScript(grant.user.id, newestEntryId, showWhatsNew)})()`);
	} finally {
		await Promise.resolve(browser.disconnect()).catch(() => {});
	}
	return { status: 'PASS', pageId, path: entryPath(grant, destination) };
}
