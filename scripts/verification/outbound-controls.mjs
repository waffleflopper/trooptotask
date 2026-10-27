export const MAIL_KINDS = Object.freeze(['account-setup', 'auth', 'invitation']);
const write = (method, path, options = {}) => Object.freeze({ method, path, ...options });
// `afterCommit` lets the provider commit, then loses its reply as a synthetic 503. `transport` loses it as a
// fetch exception instead, which the Supabase SDK reports without a database code. `pause` (milliseconds)
// holds a committed reply until an explicit release, restore or that deadline, then loses it. With `hold` it
// replaces the four-second pre-dispatch deadline that scripted holders use, so a driver can act in between.
const HOLD_DEADLINE_MS = 4000;
const COMMITTED_PAUSE_MS = 120_000;
const transportLoss = (options = {}) => ({ afterCommit: true, transport: true, ...options });
const PRESENT = Symbol('present');
export const PROVIDER_FAULTS = Object.freeze({
	'ict-tasks-insert-lost-ack': [write('POST', '/rest/v1/ict_tasks', transportLoss())],
	'ict-tasks-update-lost-ack': [write('PATCH', '/rest/v1/ict_tasks', transportLoss())],
	'ict-tasks-reorder-lost-ack': [write('POST', '/rest/v1/rpc/reorder_ict_tasks', transportLoss())],
	'ict-completions-insert-lost-ack': [write('POST', '/rest/v1/personnel_ict_completions', transportLoss())],
	'ict-completions-update-lost-ack': [write('PATCH', '/rest/v1/personnel_ict_completions', transportLoss())],
	'roster-scan-attach': [write('POST', '/rest/v1/rpc/attach_sign_in_roster_scan')],
	'roster-scan-attach-lost-ack': [write('POST', '/rest/v1/rpc/attach_sign_in_roster_scan', transportLoss())],
	'roster-scan-attach-committed-hold': [
		write('POST', '/rest/v1/rpc/attach_sign_in_roster_scan', transportLoss({ pause: COMMITTED_PAUSE_MS }))
	],
	'roster-scan-attach-hold': [write('POST', '/rest/v1/rpc/attach_sign_in_roster_scan', { hold: true })],
	'roster-scan-attach-predispatch-pause': [
		write('POST', '/rest/v1/rpc/attach_sign_in_roster_scan', { hold: true, pause: COMMITTED_PAUSE_MS })
	],
	'roster-scan-remove': [write('POST', '/rest/v1/rpc/remove_sign_in_roster_scan')],
	'roster-scan-remove-lost-ack': [write('POST', '/rest/v1/rpc/remove_sign_in_roster_scan', transportLoss())],
	'roster-scan-remove-hold': [write('POST', '/rest/v1/rpc/remove_sign_in_roster_scan', { hold: true })],
	'roster-scan-settle': [write('POST', '/rest/v1/rpc/settle_sign_in_roster_scan_upload')],
	'roster-delete': [write('POST', '/rest/v1/rpc/delete_sign_in_roster')],
	'roster-delete-lost-ack': [write('POST', '/rest/v1/rpc/delete_sign_in_roster', transportLoss())],
	'roster-delete-hold': [write('POST', '/rest/v1/rpc/delete_sign_in_roster', { hold: true })],
	'federal-holiday-reset': [write('POST', '/rest/v1/rpc/reset_federal_holidays')],
	'federal-holiday-reset-lost-ack': [write('POST', '/rest/v1/rpc/reset_federal_holidays', transportLoss())],
	'federal-holiday-reset-hold': [
		write('POST', '/rest/v1/rpc/reset_federal_holidays', { hold: true, pause: COMMITTED_PAUSE_MS })
	],
	'closure-days': [write('POST', '/rest/v1/rpc/add_closure_days')],
	'closure-days-lost-ack': [write('POST', '/rest/v1/rpc/add_closure_days', transportLoss())],
	'closure-days-hold': [write('POST', '/rest/v1/rpc/add_closure_days', { hold: true, pause: COMMITTED_PAUSE_MS })],
	'calendar-lanes': [write('POST', '/rest/v1/rpc/set_calendar_lanes')],
	'calendar-lanes-lost-ack': [write('POST', '/rest/v1/rpc/set_calendar_lanes', transportLoss())],
	'calendar-lanes-hold': [write('POST', '/rest/v1/rpc/set_calendar_lanes', { hold: true, pause: COMMITTED_PAUSE_MS })],
	'status-order': [write('POST', '/rest/v1/rpc/set_status_type_order')],
	'status-order-lost-ack': [write('POST', '/rest/v1/rpc/set_status_type_order', transportLoss())],
	'status-order-hold': [write('POST', '/rest/v1/rpc/set_status_type_order', { hold: true, pause: COMMITTED_PAUSE_MS })],
	'document-file-remove': [write('DELETE', '/storage/v1/object/personnel-documents')],
	'document-file-remove-lost-ack': [write('DELETE', '/storage/v1/object/personnel-documents', { afterCommit: true })],
	'counseling-file-remove': [write('DELETE', '/storage/v1/object/counseling-files')],
	'counseling-file-remove-lost-ack': [write('DELETE', '/storage/v1/object/counseling-files', { afterCommit: true })],
	'document-attach': [write('POST', '/rest/v1/personnel_documents')],
	'counseling-attach': [write('POST', '/rest/v1/counseling_records')],
	'document-attach-lost-ack': [write('POST', '/rest/v1/personnel_documents', { afterCommit: true })],
	'counseling-attach-lost-ack': [write('POST', '/rest/v1/counseling_records', { afterCommit: true })],
	'setup-link-create': [write('POST', '/rest/v1/rpc/issue_account_setup_link')],
	'invitation-access-link': [write('POST', '/rest/v1/rpc/link_organization_invitation_access_request')],
	'people-directory-read': [write('POST', '/rest/v1/rpc/platform_account_directory')],
	// The Supabase client retries an idempotent read after a 503, so a one-shot read fault answers 500 instead.
	'person-organizations-read': [write('GET', '/rest/v1/organization_memberships', { status: 500 })],
	'person-recent-activity-read': [write('GET', '/rest/v1/audit_logs', { status: 500 })],
	'setup-timeline-read': [write('GET', '/rest/v1/account_setup_links', { status: 500 })],
	'people-directory-read-hold': [
		write('POST', '/rest/v1/rpc/platform_account_directory', { hold: true, pause: COMMITTED_PAUSE_MS })
	],
	'person-organizations-read-hold': [
		write('GET', '/rest/v1/organization_memberships', { hold: true, pause: COMMITTED_PAUSE_MS })
	],
	'person-recent-activity-read-hold': [write('GET', '/rest/v1/audit_logs', { hold: true, pause: COMMITTED_PAUSE_MS })],
	'setup-timeline-read-hold': [write('GET', '/rest/v1/account_setup_links', { hold: true, pause: COMMITTED_PAUSE_MS })],
	'invitation-block': [write('PATCH', '/rest/v1/organization_invitations', { body: { status: 'blocked' } })],
	'org-create': [write('POST', '/rest/v1/rpc/create_organization')],
	'org-create-lost-ack': [write('POST', '/rest/v1/rpc/create_organization', { afterCommit: true })],
	'org-setup-answer': [write('POST', '/rest/v1/rpc/save_organization_setup_answer')],
	'org-setup-training-count': [write('HEAD', '/rest/v1/training_types', { status: 500 })],
	'password-update': [write('PUT', '/auth/v1/user', { body: { password: PRESENT } })],
	'password-reconcile': [write('POST', '/rest/v1/rpc/password_change_attempt', { body: { p_action: 'reconcile' } })],
	'password-revocation': [write('POST', '/auth/v1/logout', { query: { scope: 'others' } })],
	'setup-password': [write('POST', '/auth/v1/admin/users')],
	'setup-reconcile': [write('POST', '/rest/v1/rpc/reconcile_account_setup_claim')],
	'setup-finalize': [write('POST', '/rest/v1/rpc/complete_account_setup_recovery')],
	'setup-finalize-lost-ack': [write('POST', '/rest/v1/rpc/complete_account_setup_recovery', { afterCommit: true })],
	'onboarding-steps-insert': [write('POST', '/rest/v1/onboarding_template_steps')],
	'onboarding-steps-update': [write('PATCH', '/rest/v1/onboarding_template_steps')],
	'onboarding-steps-delete': [write('DELETE', '/rest/v1/onboarding_template_steps')],
	'onboarding-template-duplicate': [write('POST', '/rest/v1/rpc/duplicate_onboarding_template')],
	'onboarding-template-duplicate-lost-ack': [
		write('POST', '/rest/v1/rpc/duplicate_onboarding_template', { afterCommit: true })
	],
	'onboarding-template-reorder': [write('POST', '/rest/v1/rpc/reorder_onboarding_template_steps')],
	'onboarding-template-reorder-lost-ack': [
		write('POST', '/rest/v1/rpc/reorder_onboarding_template_steps', { afterCommit: true })
	],
	'onboarding-template-delete': [write('POST', '/rest/v1/rpc/delete_onboarding_template')],
	'onboarding-template-delete-lost-ack': [
		write('POST', '/rest/v1/rpc/delete_onboarding_template', { afterCommit: true })
	]
});
const MAIL_URL = 'https://api.resend.com/emails';
const MAX_MESSAGES = 200;
const SETUP_LINK = /https?:\/\/[^\s"'<>]+\/auth\/setup-account\?token=[^\s"'<>]+/i;
const AUTH_LINK = /https?:\/\/[^\s"'<>]+\/auth\/confirm\?[^\s"'<>]+/i;
const APP_LINK = /https?:\/\/[^\s"'<>]+\/auth\/[^\s"'<>]*/gi;

export function providerOrigin(value) {
	const url = new URL(value);
	if (
		url.protocol !== 'http:' ||
		url.hostname !== '127.0.0.1' ||
		!url.port ||
		url.username ||
		url.password ||
		url.pathname !== '/' ||
		url.search ||
		url.hash
	)
		throw new Error('Source controls require the exact owned loopback provider origin.');
	return url.origin;
}

export function redactLinkTokens(value) {
	return String(value).replace(
		/([?&#][^=&#\s"']*(?:token|hash|secret|code|key)[^=&#\s"']*=)[^&#\s"']*/gi,
		'$1[redacted]'
	);
}

function describe(input, init) {
	let url;
	try {
		url = new URL(input instanceof Request ? input.url : String(input));
	} catch {
		return null;
	}
	return { url, method: String(init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase() };
}

async function bodyText(input, init) {
	const body = init?.body ?? (input instanceof Request ? await input.clone().text() : undefined);
	if (typeof body === 'string') return body;
	return body instanceof Uint8Array ? new TextDecoder().decode(body) : null;
}

async function requestBody(input, init) {
	try {
		return JSON.parse(await bodyText(input, init));
	} catch {
		return null;
	}
}

const matchesBody = (expected, body) =>
	!!body &&
	typeof body === 'object' &&
	!Array.isArray(body) &&
	Object.entries(expected).every(([key, value]) =>
		value === PRESENT ? Object.hasOwn(body, key) : body[key] === value
	);

const json = (status, body) =>
	new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function pathOf(link) {
	try {
		const url = new URL(link);
		return redactLinkTokens(url.pathname + url.search + url.hash);
	} catch {
		return '[unparseable]';
	}
}

function classify(message) {
	const body = `${message.text}\n${message.html ?? ''}`;
	const links = [...message.text.matchAll(APP_LINK)].map(([link]) => link);
	return {
		kind: SETUP_LINK.test(body) ? 'account-setup' : AUTH_LINK.test(body) ? 'auth' : 'invitation',
		link: (SETUP_LINK.test(message.text) ? message.text.match(SETUP_LINK)[0] : links[0]) ?? null,
		links
	};
}

export function createMailSink({ apiKey, fetch: originalFetch }) {
	if (!/^[0-9a-f]{32,128}$/.test(apiKey) || typeof originalFetch !== 'function')
		throw new Error('Invalid owned mail sink configuration.');
	const authorization = `Bearer ${apiKey}`;
	const messages = [];
	let sequence = 0;
	let armed = null;

	function state() {
		return {
			armed: armed && { kind: armed.kind, remaining: armed.remaining, failed: armed.failed },
			messages: messages.map(({ sequence, receivedAt, to, subject, kind, delivery, links }) => ({
				sequence,
				receivedAt,
				to,
				subject,
				kind,
				delivery,
				paths: links.map(pathOf)
			}))
		};
	}

	function command(action, options = {}) {
		if (action === 'mail-arm') {
			const { mode, kind, count = 1 } = options;
			if (
				mode !== 'fail' ||
				(kind !== undefined && !MAIL_KINDS.includes(kind)) ||
				!Number.isInteger(count) ||
				count < 1 ||
				count > 10
			)
				throw new Error('Use mail fail with an optional account-setup|auth|invitation kind and count 1–10.');
			if (armed?.remaining) throw new Error('Restore the active mail failure before arming another.');
			armed = { kind, remaining: count, failed: 0 };
		} else if (action === 'mail-restore') {
			armed = null;
		} else if (action === 'mail-link') {
			const { email, kind, ordinal = 1 } = options;
			if (
				typeof email !== 'string' ||
				!MAIL_KINDS.includes(kind) ||
				!Number.isInteger(ordinal) ||
				ordinal < 1 ||
				ordinal > 10
			)
				throw new Error('Use mail-link with an email, an account-setup|auth|invitation kind and ordinal 1–10.');
			const recipient = email.trim().toLowerCase();
			const match = messages
				.filter((message) => message.delivery === 'delivered' && message.kind === kind && message.link)
				.filter((message) => message.to.includes(recipient))
				.at(-ordinal);
			return match
				? { status: 'PASS', sequence: match.sequence, link: match.link }
				: { status: 'BLOCKED', message: 'No delivered message of that kind matches that recipient and ordinal.' };
		} else if (action !== 'mail-state') {
			throw new Error('Use mail-arm, mail-restore, mail-state or mail-link.');
		}
		return { status: 'PASS', ...state() };
	}

	async function mailFetch(input, init) {
		const request = describe(input, init);
		if (
			request?.method !== 'POST' ||
			request.url.href !== MAIL_URL ||
			new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined)).get('authorization') !==
				authorization
		)
			return originalFetch(input, init);
		let payload;
		try {
			payload = JSON.parse(await bodyText(input, init));
		} catch {
			payload = null;
		}
		const to = typeof payload?.to === 'string' ? [payload.to] : payload?.to;
		if (
			!Array.isArray(to) ||
			!to.length ||
			to.some((address) => typeof address !== 'string') ||
			typeof payload.subject !== 'string' ||
			typeof payload.text !== 'string'
		)
			return json(422, { name: 'validation_error', message: 'Synthetic verification mail sink rejected the message' });
		const { kind, link, links } = classify(payload);
		const failing = armed?.remaining > 0 && (!armed.kind || armed.kind === kind);
		if (failing) {
			armed.remaining--;
			armed.failed++;
		}
		const message = {
			sequence: ++sequence,
			receivedAt: new Date().toISOString(),
			to: to.map((address) => address.trim().toLowerCase()),
			subject: payload.subject,
			kind,
			delivery: failing ? 'failed' : 'delivered',
			link,
			links
		};
		messages.push(message);
		if (messages.length > MAX_MESSAGES) messages.shift();
		return failing
			? json(503, { name: 'service_unavailable', message: 'Synthetic verification mail failure' })
			: json(200, { id: `synthetic-mail-${message.sequence}` });
	}

	return { fetch: mailFetch, command };
}

const pause = (control, deadlineMs) =>
	new Promise((resolve) => {
		const timer = setTimeout(() => control.release('deadline'), deadlineMs);
		control.release = (reason) => {
			clearTimeout(timer);
			control.call.releaseReason = reason;
			control.release = null;
			resolve();
		};
	});

export function createProviderFaultController({ providerUrl, fetch: originalFetch }) {
	const origin = providerOrigin(providerUrl);
	if (typeof originalFetch !== 'function') throw new Error('Invalid owned provider fault configuration.');
	const active = new Map();
	let last = {};

	const receipt = (control) => ({
		ordinal: control.ordinal,
		matches: control.matches,
		phase: control.phase,
		call: control.call && { ...control.call }
	});
	const receipts = (controls) => Object.fromEntries([...controls].map(([name, control]) => [name, receipt(control)]));

	function command(action, options = {}) {
		if (action === 'fault-arm') {
			const { name, ordinal = 1 } = options;
			if (!Object.hasOwn(PROVIDER_FAULTS, name) || !Number.isInteger(ordinal) || ordinal < 1 || ordinal > 10)
				throw new Error(`Use fault arm ${Object.keys(PROVIDER_FAULTS).join('|')} with ordinal 1–10.`);
			if (active.get(name)?.triggered === false)
				throw new Error('Restore that armed provider fault before arming it again.');
			active.set(name, { ordinal, matches: 0, phase: 'armed', triggered: false, call: null });
		} else if (action === 'fault-release') {
			const control = active.get(options.name);
			if (!control?.release) throw new Error('Use the name of a currently held provider request.');
			control.release('released');
		} else if (action === 'fault-restore') {
			for (const control of active.values()) {
				control.release?.('restored');
				if (control.phase !== 'dispatched') control.phase = control.triggered ? 'faulted' : 'restored';
			}
			if (active.size) last = receipts(active);
			active.clear();
		} else if (action !== 'fault-state') {
			throw new Error('Use fault-arm, fault-state or fault-restore.');
		}
		return {
			status: 'PASS',
			armed: [...active].filter(([, control]) => !control.triggered).map(([name]) => name),
			controls: receipts(active),
			lastControls: last
		};
	}

	async function armedWrite(request, input, init) {
		let body;
		for (const [name, writes] of Object.entries(PROVIDER_FAULTS)) {
			if (active.get(name)?.triggered !== false) continue;
			for (const entry of writes) {
				if (entry.method !== request.method || entry.path !== request.url.pathname) continue;
				if (entry.query && !Object.entries(entry.query).every(([k, v]) => request.url.searchParams.get(k) === v))
					continue;
				if (entry.body) {
					if (body === undefined) body = await requestBody(input, init);
					if (!matchesBody(entry.body, body)) continue;
				}
				return { name, entry };
			}
		}
		return null;
	}

	async function faultFetch(input, init) {
		if (![...active.values()].some((control) => !control.triggered)) return originalFetch(input, init);
		const request = describe(input, init);
		if (!request || request.url.origin !== origin || request.url.username || request.url.password)
			return originalFetch(input, init);
		const { name, entry } = (await armedWrite(request, input, init)) ?? {};
		if (!name) return originalFetch(input, init);
		const control = active.get(name);
		control.matches++;
		if (control.matches !== control.ordinal) return originalFetch(input, init);
		control.triggered = true;
		control.phase = 'faulted';
		control.call = { method: request.method, path: request.url.pathname };
		if (entry.hold) {
			control.phase = 'held';
			await pause(control, entry.pause ?? HOLD_DEADLINE_MS);
			control.phase = 'dispatched';
			const response = await originalFetch(input, init);
			control.call.providerStatus = response.status;
			return response;
		}
		if (entry.afterCommit) {
			const committed = await originalFetch(input, init);
			control.call.providerStatus = committed.status;
			// Only a committed write can lose its reply; a provider failure stays visible.
			if (!committed.ok) {
				control.phase = 'provider-failed';
				return committed;
			}
			await committed.arrayBuffer();
			if (entry.pause) {
				control.phase = 'committed-held';
				await pause(control, entry.pause);
				control.phase = 'faulted';
			}
			if (entry.transport)
				throw new TypeError('fetch failed', {
					cause: Object.assign(new Error('other side closed'), { code: 'UND_ERR_SOCKET' })
				});
		}
		return json(entry.status ?? 503, {
			code: 'T2T_VERIFY_PROVIDER_FAULT',
			message: 'Synthetic verification provider fault',
			details: null,
			hint: null
		});
	}

	return { fetch: faultFetch, command };
}

export async function openCapturedLink({ captured, origin, pageId, call, textContent }) {
	const link = new URL(captured.link);
	if (link.origin !== origin) throw new Error('The captured link is not on the owned app origin.');
	const secrets = [...link.searchParams]
		.filter(([name]) => /token|hash|secret|code|key/i.test(name))
		.map(([, value]) => value)
		.filter(Boolean);
	let snapshot;
	try {
		await call('navigate_page', { pageId, type: 'url', url: link.href });
		snapshot = redactLinkTokens(textContent(await call('take_snapshot', { pageId })));
	} catch {
		throw new Error('Opening the captured link failed; its DevTools error is withheld because it may carry the token.');
	}
	if (secrets.some((secret) => snapshot.includes(secret)))
		throw new Error('Link token survived redaction; refusing to print.');
	return { sequence: captured.sequence, path: link.pathname, snapshot };
}
