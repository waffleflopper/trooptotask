import { createHash, randomUUID } from 'node:crypto';
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
			state: stat.slice(stat.lastIndexOf(')') + 2).split(' ')[0],
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
	if (!current || current.state === 'Z') return;
	if (current.start !== identity.start || current.command !== identity.command)
		throw new Blocked('PROCESS_REPLACED', 'PID belongs to another process; refusing to signal it.');
	try {
		process.kill(identity.pid, 'SIGTERM');
	} catch (error) {
		if (error.code === 'ESRCH') return;
		throw error;
	}
	for (let i = 0; i < 30; i++) {
		const remaining = await processIdentity(identity.pid);
		if (!remaining || remaining.state === 'Z' || remaining.start !== identity.start) return;
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
	for (let i = 0; i < 30; i++) {
		const remaining = await processIdentity(identity.pid);
		if (!remaining || remaining.state === 'Z' || remaining.start !== identity.start) return;
		await sleep(100);
	}
	throw new Blocked('PROCESS_STILL_RUNNING', 'Owned process did not exit; retain state and retry cleanup.');
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
		let identity;
		try {
			identity = await processIdentity(Number(name));
		} catch {
			// Other users' /proc entries may be unreadable; keep looking for our browser.
			continue;
		}
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
	// .claude/skills aliases the hashed .agents/skills tree for agent tooling; every other link stays rejected.
	return [...new Set(stdout.split('\0').filter((file) => file && file !== '.claude/skills'))].sort();
}
export async function candidate(base = repository) {
	const hash = createHash('sha256');
	for (const file of await files()) {
		// Bind authoritative driving instructions to the same freshness check as the app.
		const verificationMap =
			file === '.agents/skills/verify-trooptotask/SKILL.md' ||
			(file.startsWith('.agents/skills/verify-trooptotask/features/') && file.endsWith('.md'));
		if ((file.endsWith('.md') && !verificationMap) || path.basename(file).startsWith('.env')) continue;
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
export function assertCurrentCandidate(state, currentCandidate, artifactCandidate) {
	if (currentCandidate !== state.candidate || artifactCandidate !== state.artifact)
		throw new Blocked('STALE_CANDIDATE', 'Source or owned artifact changed. Restart before driving this candidate.');
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
export async function onPath(binary, searchPath = process.env.PATH ?? '') {
	for (const directory of searchPath.split(path.delimiter)) {
		try {
			await fs.access(path.join(directory, binary), 1);
			return path.join(directory, binary);
		} catch {
			/* Next PATH entry. */
		}
	}
	return undefined;
}
// Screencast needs ffmpeg on the PATH the owned DevTools process receives, which is the clean allowlist.
export async function recording(searchPath = cleanEnvironment().PATH) {
	const ffmpeg = await onPath('ffmpeg', searchPath);
	return ffmpeg
		? { available: true, ffmpeg }
		: {
				available: false,
				message:
					'ffmpeg is not on the clean PATH, so screencast_start cannot record. Install ffmpeg to produce video evidence.'
			};
}
export function recordingTransition(name, result) {
	const text = result?.content?.map((part) => part.text ?? '').join('\n') ?? '';
	if (name === 'screencast_start' && text.includes('Screencast recording started')) return 'started';
	if (name === 'screencast_stop' && text.includes('The screencast recording has been stopped')) return 'stopped';
	return null;
}
export async function browser(provision = false) {
	const cacheDir = path.join(root, 'browsers');
	const buildId = '154.0.8037.57';
	const cached = computeExecutablePath({ browser: Browser.CHROME, buildId, cacheDir });
	for (const binary of [cached, 'google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser']) {
		try {
			const executable = path.isAbsolute(binary) ? binary : await onPath(binary);
			if (!executable) continue;
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
export async function environment(command, session, ...extra) {
	try {
		const { stdout } = await execute(
			'python3',
			[
				path.join(repository, 'scripts/verification/environment.py'),
				command,
				session,
				...(command === 'create' ? [repository] : []),
				...extra
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
