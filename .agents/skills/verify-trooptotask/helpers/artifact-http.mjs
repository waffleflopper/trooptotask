import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const families = new Set(['leader-notes', 'follow-ups', 'counseling-records', 'documents', 'award-tracking']);
const sensitiveKeys = new Set([
	'password',
	'cookie',
	'setcookie',
	'authorization',
	'token',
	'accesstoken',
	'refreshtoken',
	'idtoken',
	'sessiontoken',
	'servicerolekey',
	'apikey'
]);

async function evidenceFile(root, input) {
	if (typeof input !== 'string' || !input) throw new Error('Use an evidence file path.');
	const resolved = path.resolve(input);
	const inside = (file) => file.startsWith(root + path.sep);
	let real;
	try {
		real = await fs.realpath(resolved);
		if (!inside(real) || !(await fs.stat(real)).isFile()) throw new Error();
		return { bytes: await fs.readFile(real), relative: path.relative(root, real) };
	} catch {
		throw new Error('Input must be a readable evidence file without a symlink escape.');
	}
}

// This private jar is saved only in the owned worker's private session. The sole admitted host is the owned,
// trustworthy loopback app, where Secure cookies are usable by the native browser.
function cookieJar(origin, secrets, stored = []) {
	const cookies = new Map();
	for (const cookie of stored) {
		if (cookie.value.length >= 8) secrets.add(cookie.value);
		cookies.set(`${cookie.path}\n${cookie.name}`, { ...cookie, expires: cookie.expires ?? Infinity });
	}
	return {
		snapshot() {
			return [...cookies.values()]
				.filter((cookie) => cookie.expires > Date.now())
				.map((cookie) => ({
					...cookie,
					expires: Number.isFinite(cookie.expires) ? cookie.expires : null
				}));
		},
		absorb(response, url) {
			for (const header of response.headers.getSetCookie()) {
				const [pair, ...parts] = header.split(';');
				const equal = pair.indexOf('=');
				if (equal < 1) continue;
				const name = pair.slice(0, equal).trim();
				const value = pair.slice(equal + 1).trim();
				if (!/^[!#$%&'*+.^_`|~0-9a-z-]+$/i.test(name) || /[^\x20-\x7e]|;/.test(value)) continue;
				const attrs = Object.fromEntries(
					parts.map((part) => {
						const [key, ...rest] = part.trim().split('=');
						return [key.toLowerCase(), rest.join('=')];
					})
				);
				if (attrs.domain && attrs.domain.replace(/^\./, '').toLowerCase() !== origin.hostname) continue;
				const defaultPath = url.pathname.slice(0, url.pathname.lastIndexOf('/')) || '/';
				const cookiePath = attrs.path?.startsWith('/') ? attrs.path : defaultPath;
				let expires = attrs.expires ? Date.parse(attrs.expires) : Infinity;
				if (!Number.isFinite(expires)) expires = Infinity;
				if (/^-?\d+$/.test(attrs['max-age'] ?? '')) expires = Date.now() + Number(attrs['max-age']) * 1000;
				const key = `${cookiePath}\n${name}`;
				if (expires <= Date.now()) cookies.delete(key);
				else cookies.set(key, { name, value, path: cookiePath, expires });
				if (value.length >= 8) secrets.add(value);
			}
		},
		header(url) {
			return [...cookies.values()]
				.filter(
					(cookie) =>
						cookie.expires > Date.now() &&
						(url.pathname === cookie.path ||
							url.pathname.startsWith(cookie.path.endsWith('/') ? cookie.path : cookie.path + '/'))
				)
				.sort((a, b) => b.path.length - a.path.length)
				.map((cookie) => `${cookie.name}=${cookie.value}`)
				.join('; ');
		}
	};
}

function cachePath(session, sessionId) {
	if (typeof session !== 'string' || !path.isAbsolute(session) || !uuid.test(sessionId))
		throw new Error('Artifact HTTP requires the owned private worker session.');
	return path.join(session, 'artifact-http-sessions', sessionId);
}

async function privateCache(session, sessionId, origin, actorId) {
	const directory = cachePath(session, sessionId);
	const owner = await fs.lstat(session);
	if (!owner.isDirectory() || owner.isSymbolicLink() || owner.mode & 0o077)
		throw new Error('Artifact HTTP requires a private owned worker directory.');
	for (const entry of [path.dirname(directory), directory]) {
		try {
			await fs.mkdir(entry, { mode: 0o700 });
		} catch (error) {
			if (error.code !== 'EEXIST') throw error;
		}
		const stat = await fs.lstat(entry);
		if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('Private artifact session directory is invalid.');
		await fs.chmod(entry, 0o700);
	}
	const file = path.join(directory, `${actorId}.json`);
	const binding = { sessionId, origin, actorId };
	const clear = () => fs.rm(file, { force: true });
	return {
		clear,
		async load() {
			let stat;
			try {
				stat = await fs.lstat(file);
			} catch (error) {
				if (error.code === 'ENOENT') return [];
				throw error;
			}
			if (!stat.isFile() || stat.isSymbolicLink() || (stat.mode & 0o777) !== 0o600)
				throw new Error('Private artifact session file is invalid or has unsafe permissions.');
			const raw = await fs.readFile(file, 'utf8');
			let data;
			try {
				data = JSON.parse(raw);
			} catch {
				await clear();
				return [];
			}
			const valid =
				data?.admitted === true &&
				Object.entries(binding).every(([key, value]) => data[key] === value) &&
				Array.isArray(data.cookies) &&
				data.cookies.every(
					(cookie) =>
						cookie &&
						typeof cookie.name === 'string' &&
						/^[!#$%&'*+.^_`|~0-9a-z-]+$/i.test(cookie.name) &&
						typeof cookie.value === 'string' &&
						!/[^\x20-\x7e]|;/.test(cookie.value) &&
						typeof cookie.path === 'string' &&
						cookie.path.startsWith('/') &&
						(cookie.expires === null || Number.isFinite(cookie.expires))
				);
			if (!valid) {
				await clear();
				return [];
			}
			return data.cookies;
		},
		async save(cookies) {
			const temporary = `${file}.${randomUUID()}.tmp`;
			try {
				await fs.writeFile(temporary, JSON.stringify({ ...binding, admitted: true, cookies }), {
					mode: 0o600,
					flag: 'wx'
				});
				await fs.rename(temporary, file);
			} finally {
				await fs.rm(temporary, { force: true });
			}
		}
	};
}

export async function clearArtifactHttpCache({ session, sessionId }) {
	const directory = cachePath(session, sessionId);
	try {
		const base = await fs.lstat(path.dirname(directory));
		if (!base.isDirectory() || base.isSymbolicLink()) throw new Error('Private artifact session directory is invalid.');
		await fs.rm(directory, { recursive: true, force: true });
	} catch (error) {
		if (error.code !== 'ENOENT') throw error;
	}
}

function sanitizer(secrets) {
	let redactedValues = 0;
	const string = (value) => {
		let result = value
			.replace(
				/([?&#](?:amp;)?(?:token|access_token|refresh_token|signature|x-amz-signature|x-amz-credential)=)[^&#\s"'<>]+/gi,
				'$1[REDACTED]'
			)
			.replace(/\bBearer\s+[^\s"'<>]+/gi, 'Bearer [REDACTED]')
			.replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '[REDACTED]');
		for (const secret of secrets) result = result.split(secret).join('[REDACTED]');
		if (result !== value) redactedValues++;
		return result;
	};
	const clean = (value) => {
		if (typeof value === 'string') return string(value);
		if (Array.isArray(value)) return value.map(clean);
		if (value && typeof value === 'object')
			return Object.fromEntries(
				Object.entries(value).map(([key, item]) => {
					const secret = sensitiveKeys.has(key.replace(/[-_]/g, '').toLowerCase());
					if (secret) redactedValues++;
					return [string(key), secret ? '[REDACTED]' : clean(item)];
				})
			);
		return value;
	};
	return { clean, count: () => redactedValues };
}

/** Normal app authentication and one explicit artifact request; no provider/browser access. */
export async function artifactHttp({
	origin: originInput,
	fixture,
	evidenceRoot,
	session,
	sessionId,
	args,
	fetchImpl = fetch
}) {
	let origin;
	try {
		origin = new URL(originInput);
	} catch {
		throw new Error('Owned app origin is invalid.');
	}
	if (
		origin.protocol !== 'http:' ||
		origin.hostname !== '127.0.0.1' ||
		origin.username ||
		origin.password ||
		origin.pathname !== '/' ||
		origin.search ||
		origin.hash
	)
		throw new Error('Use only the owned loopback app origin.');
	const [role, orgKey, personId, method, endpoint, bodyFile] = args;
	const actor = Object.hasOwn(fixture.actors, role) ? fixture.actors[role] : null;
	if (
		!actor ||
		!uuid.test(actor.id) ||
		typeof actor.email !== 'string' ||
		typeof actor.password !== 'string' ||
		!actor.password
	)
		throw new Error('Use a known fixture actor with normal login credentials.');
	if (!['orgA', 'orgB'].includes(orgKey) || !uuid.test(fixture.ids[orgKey]))
		throw new Error('Use synthetic orgA or orgB.');
	if (!uuid.test(personId)) throw new Error('Use a Personnel UUID.');
	const segments = typeof endpoint === 'string' ? endpoint.split('/') : [];
	const [family, recordId, download] = segments;
	if (family === 'award-tracking' && (method !== 'POST' || segments.length !== 1))
		throw new Error('Award acknowledgement accepts only its collection POST.');
	if (
		!families.has(family) ||
		segments.length > 3 ||
		(segments.length > 1 && !uuid.test(recordId)) ||
		(segments.length === 3 && (family !== 'documents' || download !== 'download'))
	)
		throw new Error('Use an exact allowlisted artifact collection, record, or document download.');
	const methods = segments.length === 1 ? ['GET', 'POST'] : segments.length === 2 ? ['PATCH', 'DELETE'] : ['GET'];
	if (!methods.includes(method)) throw new Error('Method is not supported by this artifact route.');
	const needsBody = ['POST', 'PATCH'].includes(method);
	if (args.length < 5 || args.length > 6 || needsBody !== Boolean(bodyFile))
		throw new Error('POST/PATCH require one body file; GET/DELETE accept none.');
	const pathname = `/org/${fixture.ids[orgKey]}/api/personnel/${personId}/${endpoint}`;
	let input;
	let body;
	let upload;
	let source;
	const headers = { Accept: 'application/json', Origin: origin.origin };
	if (needsBody) {
		const root = await fs.realpath(evidenceRoot);
		const file = await evidenceFile(root, bodyFile);
		source = file.relative;
		try {
			input = JSON.parse(file.bytes.toString('utf8'));
		} catch {
			throw new Error('Body file must contain JSON.');
		}
		if (!input || Array.isArray(input) || typeof input !== 'object') throw new Error('Body JSON must be an object.');
		if (family === 'award-tracking' && (Object.keys(input).length !== 1 || typeof input.acknowledged !== 'boolean'))
			throw new Error('Award acknowledgement requires only a boolean acknowledged field.');
		if (method === 'POST' && ['documents', 'counseling-records'].includes(family)) {
			body = new FormData();
			for (const [key, value] of Object.entries(input)) {
				if (key === 'file') continue;
				if (!['string', 'number', 'boolean'].includes(typeof value))
					throw new Error('Multipart fields must be strings, numbers, or booleans.');
				body.append(key, String(value));
			}
			if (Object.hasOwn(input, 'file')) {
				const descriptor = input.file;
				if (
					!descriptor ||
					typeof descriptor !== 'object' ||
					Array.isArray(descriptor) ||
					Object.keys(descriptor).some((key) => !['path', 'type', 'name'].includes(key)) ||
					typeof descriptor.type !== 'string' ||
					/[^\x20-\x7e]/.test(descriptor.type)
				)
					throw new Error('Multipart file must specify an evidence path, MIME type, and optional filename.');
				const file = await evidenceFile(root, descriptor.path);
				const name = descriptor.name ?? path.basename(descriptor.path);
				if (typeof name !== 'string' || !name || name === '.' || name === '..' || /[/\\\r\n]/.test(name))
					throw new Error('Use a plain upload filename.');
				const attachment = new File([file.bytes], name, { type: descriptor.type });
				body.append('file', attachment);
				upload = {
					source: file.relative,
					name,
					type: attachment.type,
					bytes: file.bytes.length,
					sha256: createHash('sha256').update(file.bytes).digest('hex')
				};
				input = { ...input, file: { ...descriptor, path: file.relative } };
			}
		} else {
			headers['Content-Type'] = 'application/json';
			body = JSON.stringify(input);
		}
	}
	const secrets = new Set([actor.password]);
	const cache = await privateCache(session, sessionId, origin.origin, actor.id);
	let jar = cookieJar(origin, secrets, await cache.load());
	let admitted = Boolean(jar.header(new URL(pathname, origin)));
	const send = async (pathname, options) => {
		const url = new URL(pathname, origin);
		const requestHeaders = new Headers(options.headers);
		const cookie = jar.header(url);
		if (cookie) requestHeaders.set('Cookie', cookie);
		let response;
		try {
			response = await fetchImpl(url.href, {
				...options,
				headers: requestHeaders,
				redirect: 'manual',
				signal: AbortSignal.timeout(60000)
			});
		} catch {
			throw new Error('Owned app HTTP request failed.');
		}
		jar.absorb(response, url);
		if (admitted) await cache.save(jar.snapshot());
		const location = response.headers.get('Location');
		if (location) {
			let next;
			try {
				next = new URL(location, url);
			} catch {
				throw new Error('Owned app returned an invalid redirect.');
			}
			if (next.origin !== origin.origin || next.username || next.password)
				throw new Error('Owned app returned a redirect outside its origin.');
		}
		return response;
	};
	const authenticatedRedirect = (response) =>
		response.status === 303 &&
		response.headers.get('Location') &&
		new URL(response.headers.get('Location'), origin).href === new URL('/dashboard', origin).href;
	const confirm = () => send('/auth/login', { method: 'GET', headers: { Accept: 'text/html' } });
	let mode = 'reused';
	let loginStatus = null;
	let previousConfirmationStatus = null;
	let confirmation;
	if (admitted) {
		confirmation = await confirm();
		if (confirmation.status === 429 || confirmation.status >= 500) {
			const retryAfter = confirmation.headers.get('Retry-After');
			const pacing = /^\d+$/.test(retryAfter ?? '') ? ` Retry after ${retryAfter} seconds.` : '';
			throw new Error(`Cached authenticated-session check unavailable (HTTP ${confirmation.status}).${pacing}`);
		}
		if (!authenticatedRedirect(confirmation) || !jar.header(new URL(pathname, origin))) {
			previousConfirmationStatus = confirmation.status;
			admitted = false;
		}
	}
	if (!admitted) {
		await cache.clear();
		jar = cookieJar(origin, secrets);
		mode = 'normal';
		const login = await send('/auth/login?/login', {
			method: 'POST',
			headers: { Accept: 'text/html', Origin: origin.origin, 'Content-Type': 'application/x-www-form-urlencoded' },
			body: new URLSearchParams({ email: actor.email, password: actor.password, next: '/dashboard' })
		});
		loginStatus = login.status;
		if (!authenticatedRedirect(login)) {
			const retryAfter = login.headers.get('Retry-After');
			const pacing = /^\d+$/.test(retryAfter ?? '') ? ` Retry after ${retryAfter} seconds.` : '';
			throw new Error(`Normal fixture login did not authenticate (HTTP ${login.status}).${pacing}`);
		}
		if (!jar.header(new URL(pathname, origin)))
			throw new Error('Normal fixture login supplied no usable artifact session cookies.');
		confirmation = await confirm();
		if (!authenticatedRedirect(confirmation) || !jar.header(new URL(pathname, origin)))
			throw new Error(`Independent authenticated-session check failed (HTTP ${confirmation.status}).`);
		admitted = true;
		await cache.save(jar.snapshot());
	}
	const response = await send(pathname, { method, headers, body });
	let raw;
	try {
		raw = await response.text();
	} catch {
		throw new Error('Artifact HTTP response could not be read.');
	}
	let result;
	try {
		result = JSON.parse(raw);
	} catch {
		result = raw;
	}
	const sanitize = sanitizer(secrets);
	const output = sanitize.clean({
		actor: role,
		actorId: actor.id,
		organization: orgKey,
		organizationId: fixture.ids[orgKey],
		personId,
		method,
		path: pathname,
		authentication: { mode, loginStatus, confirmationStatus: confirmation.status, previousConfirmationStatus },
		request: {
			encoding: body instanceof FormData ? 'multipart' : needsBody ? 'json' : 'none',
			source,
			body: input,
			upload
		},
		status: response.status,
		retryAfter: response.headers.get('Retry-After'),
		contentType: response.headers.get('Content-Type'),
		location: response.headers.get('Location'),
		responseBytes: Buffer.byteLength(raw),
		body: result
	});
	return { ...output, redactedValues: sanitize.count() };
}
