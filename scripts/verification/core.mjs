import { createHash, createHmac, randomUUID, randomBytes, timingSafeEqual } from 'node:crypto';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:net';
import { homedir } from 'node:os';
import { Browser, install, computeExecutablePath } from '@puppeteer/browsers';

export const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const root = path.join(repository, '.verification');
export const sessions = path.join(
	homedir(),
	'.local/state/trooptotask-verification',
	createHash('sha256').update(repository).digest('hex').slice(0, 16)
);
export const execute = promisify(execFile);
export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
export const readJSON = async (file) => JSON.parse(await fs.readFile(file, 'utf8'));
export async function processIdentity(pid) {
	try {
		const stat = await fs.readFile(`/proc/${pid}/stat`, 'utf8');
		return {
			pid,
			group: Number(stat.slice(stat.lastIndexOf(')') + 2).split(' ')[2]),
			start: stat.slice(stat.lastIndexOf(')') + 2).split(' ')[19],
			command: await fs.readFile(`/proc/${pid}/cmdline`, 'utf8')
		};
	} catch (error) {
		if (error.code === 'ENOENT' || error.code === 'ESRCH') return null;
		throw error;
	}
}
export async function stopOwnedProcess(identity) {
	if (!identity) return;
	const current = await processIdentity(identity.pid);
	if (!current) return;
	if (current.start !== identity.start || current.command !== identity.command)
		throw new Blocked('PROCESS_REPLACED', 'PID belongs to another process; refusing to signal it.');
	try {
		process.kill(identity.pid, 'SIGTERM');
	} catch (error) {
		if (error.code === 'ESRCH') return;
		throw error;
	}
	for (let i = 0; i < 30; i++) {
		if (!(await processIdentity(identity.pid))) return;
		await sleep(100);
	}
	const remaining = await processIdentity(identity.pid);
	if (remaining?.start === identity.start && remaining.command === identity.command) {
		try {
			process.kill(identity.pid, 'SIGKILL');
		} catch (error) {
			if (error.code !== 'ESRCH') throw error;
		}
	}
}
export async function terminateOwnedGroup(identity) {
	const current = identity && (await processIdentity(identity.pid));
	if (
		!current ||
		current.start !== identity.start ||
		current.command !== identity.command ||
		current.group !== current.pid
	)
		throw new Blocked(
			'PROCESS_REPLACED',
			'Cannot establish ownership of the launch process group; refusing termination.'
		);
	// The supervisor was spawned detached: its group contains only toolkit children.
	// Forced cancellation prevents a hung build/provider client from retaining the worker.
	process.kill(-current.pid, 'SIGKILL');
}
export async function profileProcess(profile) {
	for (const name of await fs.readdir('/proc')) {
		if (!/^\d+$/.test(name)) continue;
		const identity = await processIdentity(Number(name));
		if (identity?.command.split('\0').includes(`--user-data-dir=${profile}`)) return identity;
	}
	return null;
}
export async function writeJSON(file, value) {
	await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
	const temporary = `${file}.${randomUUID()}.tmp`;
	await fs.writeFile(temporary, JSON.stringify(value, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
	await fs.rename(temporary, file);
}
export class Blocked extends Error {
	constructor(code, message) {
		super(message);
		this.code = code;
	}
}
export function sessionPath(worker = '1') {
	if (!['1', '2'].includes(worker))
		throw new Blocked('WORKER', 'Choose worker 1 or 2; each owns an exclusive session.');
	return path.join(sessions, `worker-${worker}`);
}
export async function files() {
	const { stdout } = await execute('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], {
		cwd: repository
	});
	return [...new Set(stdout.split('\0').filter(Boolean))].sort();
}
export async function candidate(base = repository) {
	const hash = createHash('sha256');
	for (const file of await files()) {
		// Prose receipts do not invalidate executable evidence; executable maps do.
		if (file.endsWith('.md') || path.basename(file).startsWith('.env')) continue;
		try {
			const stat = await fs.lstat(path.join(base, file));
			if (!stat.isFile()) throw new Blocked('SOURCE_TYPE', `Unsupported source entry ${file}; use regular files.`);
			hash
				.update(file + '\0')
				.update(await fs.readFile(path.join(base, file)))
				.update('\0');
		} catch (error) {
			if (error.code !== 'ENOENT') throw error;
			hash.update(file + '\0DELETED\0');
		}
	}
	return hash.digest('hex');
}
export async function snapshot(destination) {
	await fs.mkdir(destination, { recursive: true, mode: 0o700 });
	for (const file of await files()) {
		// Vite must never discover contributor/provider dotenv files in the copy.
		if (path.basename(file).startsWith('.env')) continue;
		const source = path.join(repository, file);
		try {
			if (!(await fs.lstat(source)).isFile())
				throw new Blocked('SOURCE_TYPE', `Cannot copy ${file}; regular files required.`);
			await fs.mkdir(path.dirname(path.join(destination, file)), { recursive: true });
			await fs.copyFile(source, path.join(destination, file));
		} catch (error) {
			if (error.code !== 'ENOENT') throw error;
		}
	}
	await fs.symlink(path.join(repository, 'node_modules'), path.join(destination, 'node_modules'), 'dir');
}
export async function directoryDigest(directory, ignored = []) {
	const hash = createHash('sha256');
	async function walk(relative = '') {
		for (const entry of (await fs.readdir(path.join(directory, relative), { withFileTypes: true })).sort((a, b) =>
			a.name.localeCompare(b.name)
		)) {
			if (!relative && ignored.includes(entry.name)) continue;
			const name = path.join(relative, entry.name);
			if (entry.isDirectory()) await walk(name);
			else if (entry.isFile())
				hash
					.update(name + '\0')
					.update(await fs.readFile(path.join(directory, name)))
					.update('\0');
			else throw new Blocked('ARTIFACT_TYPE', `Unexpected non-file in owned artifact: ${name}`);
		}
	}
	await walk();
	return hash.digest('hex');
}
export function cleanEnvironment() {
	// Allowlist: never inherit provider, deployment, proxy, or app secrets.
	return Object.fromEntries(
		['PATH', 'HOME', 'TMPDIR', 'LANG', 'DISPLAY', 'XDG_RUNTIME_DIR']
			.filter((key) => process.env[key])
			.map((key) => [key, process.env[key]])
	);
}
export async function browser(provision = false) {
	const cacheDir = path.join(root, 'browsers');
	const buildId = '154.0.8037.57';
	const cached = computeExecutablePath({ browser: Browser.CHROME, buildId, cacheDir });
	for (const binary of [cached, 'google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser']) {
		try {
			let executable = binary;
			if (!path.isAbsolute(binary)) {
				executable = undefined;
				for (const directory of process.env.PATH.split(path.delimiter)) {
					try {
						await fs.access(path.join(directory, binary), 1);
						executable = path.join(directory, binary);
						break;
					} catch {
						/* Next PATH entry. */
					}
				}
				if (!executable) continue;
			}
			const { stdout } = await execute(executable, ['--version'], { env: cleanEnvironment() });
			const major = Number(stdout.match(/(\d+)\./)?.[1]);
			if (major >= 149) return { executable, version: stdout.trim(), provisioned: binary === cached };
		} catch {
			/* Try the next installed browser. */
		}
	}
	if (provision) {
		await fs.mkdir(root, { recursive: true, mode: 0o700 });
		const temporary = await fs.mkdtemp(path.join(root, 'browser-download-'));
		try {
			const installed = await install({ browser: Browser.CHROME, buildId, cacheDir: temporary });
			await execute(installed.executablePath, ['--version'], { env: cleanEnvironment() });
			const destination = path.join(cacheDir, path.relative(temporary, installed.path));
			await fs.mkdir(path.dirname(destination), { recursive: true, mode: 0o700 });
			try {
				await fs.rename(installed.path, destination);
			} catch (error) {
				if (!['EEXIST', 'ENOTEMPTY'].includes(error.code)) throw error;
				await fs.access(cached, 1);
			}
			return await browser(false);
		} catch {
			throw new Blocked(
				'BROWSER_PROVISION',
				'Chrome for Testing download/extraction/launch failed. Check network, unzip on PATH, and Chrome OS libraries; rerun setup or install Chrome >=149.'
			);
		} finally {
			await fs.rm(temporary, { recursive: true, force: true });
		}
	}
	throw new Blocked(
		'BROWSER_MISSING',
		'No compatible Chrome >=149. Run npm run verify:app -- setup to provision pinned Chrome for Testing.'
	);
}
export async function reservePort() {
	const server = createServer();
	await new Promise((resolve, reject) => {
		server.once('error', reject);
		server.listen(0, '127.0.0.1', resolve);
	});
	return { port: server.address().port, release: () => new Promise((resolve) => server.close(resolve)) };
}
export async function environment(command, session, origin) {
	try {
		const { stdout } = await execute(
			'python3',
			[
				path.join(repository, 'scripts/verification/environment.py'),
				command,
				session,
				...(command === 'create' ? [repository, origin] : [])
			],
			{ env: cleanEnvironment(), timeout: 300_000, maxBuffer: 1024 * 1024 }
		);
		return JSON.parse(stdout);
	} catch (error) {
		let detail;
		try {
			detail = JSON.parse(error.stdout);
		} catch {
			/* Do not expose potentially credential-bearing subprocess output. */
		}
		throw new Blocked(
			'PROVIDER_' + command.toUpperCase(),
			detail?.message ??
				'Disposable provider operation failed. Inspect the private session log and retry cleanup before launch.'
		);
	}
}
export async function runLogged(command, args, cwd, env, log) {
	const fd = await fs.open(log, 'a', 0o600);
	const child = spawn(command, args, { cwd, env, stdio: ['ignore', fd.fd, fd.fd] });
	child.completion = new Promise((resolve, reject) => {
		child.once('error', reject);
		child.once('exit', resolve);
	});
	// Observe immediately, even if the caller only waits after the process exits.
	child.completion.catch(() => {});
	await fd.close();
	return child;
}
export async function completed(child, label) {
	const code = await child.completion;
	if (code !== 0)
		throw new Blocked(
			'PROCESS_FAILED',
			`${label} exited ${code}; inspect private logs. Required proof is unavailable.`
		);
}
export async function receipt(state, result) {
	const file = path.join(root, 'evidence', `${Date.now()}-${randomUUID()}.json`);
	const value = {
		schema: 1,
		recordedAt: new Date().toISOString(),
		candidate: state.candidate,
		artifact: state.artifact,
		revision: state.revision,
		session: state.id,
		mutation: state.mutation ?? null,
		browser: state.browser.version,
		origin: state.origin,
		...result
	};
	const key = await receiptKey(true);
	value.seal = createHmac('sha256', key).update(JSON.stringify(value)).digest('hex');
	await writeJSON(file, value);
	return { ...value, receipt: file };
}
async function receiptKey(create = false) {
	const file = path.join(sessions, 'receipt-key');
	if (create) {
		await fs.mkdir(sessions, { recursive: true, mode: 0o700 });
		const temporary = path.join(sessions, `receipt-key-${randomUUID()}.tmp`);
		await fs.writeFile(temporary, randomBytes(32), { flag: 'wx', mode: 0o600 });
		try {
			await fs.link(temporary, file);
		} catch (error) {
			if (error.code !== 'EEXIST') throw error;
		} finally {
			await fs.rm(temporary, { force: true });
		}
	}
	try {
		return await fs.readFile(file);
	} catch {
		throw new Blocked(
			'RECEIPT_KEY',
			'This checkout has no receipt issuer key. Re-run proof locally; imported evidence is not local approval.'
		);
	}
}
export async function checkReceipt(file) {
	const value = await readJSON(path.resolve(file));
	const { seal, ...body } = value;
	const expectedSeal = createHmac('sha256', await receiptKey())
		.update(JSON.stringify(body))
		.digest();
	if (
		typeof seal !== 'string' ||
		!/^[a-f0-9]{64}$/.test(seal) ||
		!timingSafeEqual(Buffer.from(seal, 'hex'), expectedSeal)
	)
		throw new Blocked(
			'EVIDENCE_EDITED',
			'Receipt was not issued here or was edited. Run prove again; do not repair evidence by hand.'
		);
	if (typeof value.claim !== 'string' || !Array.isArray(value.observations) || !value.session || !value.origin)
		throw new Blocked('EVIDENCE_SHAPE', 'Receipt is missing required claim evidence.');
	if (value.schema !== 1 || value.candidate !== (await candidate()))
		throw new Blocked(
			'STALE_EVIDENCE',
			'Receipt does not identify the current executable candidate. Relaunch and prove this candidate.'
		);
	if (value.mutation || value.artifact !== value.candidate || value.status !== 'PASS')
		throw new Blocked(
			'INCOMPLETE_EVIDENCE',
			'Only a healthy PASS receipt supplies this claim; required checks still follow Definition of Done.'
		);
	return {
		status: 'PASS',
		claim: value.claim,
		candidate: value.candidate,
		scope: 'This claim only; not CI, release, or merge approval.'
	};
}
