import fs from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { puppeteer } from '../../node_modules/chrome-devtools-mcp/build/src/third_party/index.js';
import { Blocked, processIdentity, repository } from './core.mjs';

const evidenceRoot = path.join(repository, '.verification/evidence/verify-trooptotask');
const documentState = '() => ({ url: location.href, timeOrigin: performance.timeOrigin, ready: document.readyState })';
const queryKeys = new Set(['view', 'group', 'rank', 'mos', 'role', 'types', 'horizon', 'rowsBy']);
const fail = (code, message) => {
	throw new Blocked(code, message);
};

function captureInput(input, origin) {
	if (
		!input ||
		Object.keys(input).some((key) => !['command', 'pageId', 'expectedUrl', 'filePath'].includes(key)) ||
		input.command !== 'print-capture' ||
		!Number.isSafeInteger(input.pageId) ||
		input.pageId < 1 ||
		typeof input.expectedUrl !== 'string' ||
		typeof input.filePath !== 'string'
	)
		fail('PRINT_INPUT', 'Use print save PAGE EXACT_REPORT_URL FILE.pdf.');
	let url;
	try {
		url = new URL(input.expectedUrl);
	} catch {
		fail('PRINT_INPUT', 'Expected URL must be an exact owned report URL.');
	}
	if (
		url.origin !== origin ||
		url.username ||
		url.password ||
		url.hash ||
		url.href !== input.expectedUrl ||
		!/^\/org\/[A-Za-z0-9][A-Za-z0-9_-]*\/training\/reports$/.test(url.pathname) ||
		[...url.searchParams.keys()].some((key) => !queryKeys.has(key))
	)
		fail('PRINT_URL', 'Use the loaded Training report URL in this owned app.');
	const target = path.resolve(repository, input.filePath);
	if (!target.startsWith(evidenceRoot + path.sep) || path.extname(target) !== '.pdf')
		fail('PRINT_PATH', 'PDF must be under .verification/evidence/verify-trooptotask.');
	return { ...input, target };
}

export async function ownedPrintEndpoint(state, session, { identity = processIdentity, procRoot = '/proc' } = {}) {
	if (state.phase !== 'running' || state.repository !== repository)
		fail('PRINT_OWNER', 'Print capture requires this running owned worker.');
	for (const recorded of [state.supervisor, state.mcpProcess, state.browserProcess]) {
		const current = recorded && (await identity(recorded.pid));
		if (
			!current ||
			current.state === 'Z' ||
			current.pid !== recorded.pid ||
			current.start !== recorded.start ||
			current.command !== recorded.command
		)
			fail('PRINT_OWNER', 'An owned process is unavailable or replaced.');
	}
	const profile = path.join(session, 'chrome-profile');
	const args = state.browserProcess.command.split('\0');
	if (
		args.filter((arg) => arg === `--user-data-dir=${profile}`).length !== 1 ||
		!args.includes('--remote-debugging-port=0') ||
		args.includes('--remote-debugging-pipe') ||
		(await fs.realpath(profile)) !== profile
	)
		fail('PRINT_OWNER', 'The recorded browser does not own the private print profile.');
	const endpointFile = path.join(profile, 'DevToolsActivePort');
	const stat = await fs.lstat(endpointFile);
	if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 256)
		fail('PRINT_ENDPOINT', 'Owned print endpoint metadata is invalid. Relaunch the worker.');
	const match = (await fs.readFile(endpointFile, 'utf8')).match(
		/^(\d{1,5})\n(\/devtools\/browser\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\n?$/
	);
	const port = Number(match?.[1]);
	if (!match || port < 1 || port > 65535)
		fail('PRINT_ENDPOINT', 'Owned print endpoint metadata is invalid. Relaunch the worker.');
	const processRoot = path.join(procRoot, String(state.browserProcess.pid));
	const sockets = new Set();
	for (const name of await fs.readdir(path.join(processRoot, 'fd'))) {
		try {
			const inode = (await fs.readlink(path.join(processRoot, 'fd', name))).match(/^socket:\[(\d+)\]$/)?.[1];
			if (inode) sockets.add(inode);
		} catch (error) {
			if (error.code !== 'ENOENT') throw error;
		}
	}
	const listeners = [];
	for (const family of ['tcp', 'tcp6']) {
		const lines = (await fs.readFile(path.join(processRoot, 'net', family), 'utf8')).trim().split('\n').slice(1);
		for (const line of lines) {
			const fields = line.trim().split(/\s+/);
			const [address, hexPort] = fields[1].split(':');
			if (fields[3] === '0A' && parseInt(hexPort, 16) === port) listeners.push({ family, address, inode: fields[9] });
		}
	}
	if (
		listeners.length !== 1 ||
		listeners[0].family !== 'tcp' ||
		listeners[0].address !== '0100007F' ||
		!sockets.has(listeners[0].inode)
	)
		fail('PRINT_ENDPOINT', 'Print listener is not the recorded browser on loopback.');
	return `ws://127.0.0.1:${port}${match[2]}`;
}

function deadline(milliseconds) {
	const controller = new AbortController();
	const end = Date.now() + milliseconds;
	const timer = setTimeout(
		() => controller.abort(new Blocked('PRINT_TIMEOUT', 'Print capture exceeded its deadline.')),
		milliseconds
	);
	const check = () => {
		if (Date.now() >= end && !controller.signal.aborted)
			controller.abort(new Blocked('PRINT_TIMEOUT', 'Print capture exceeded its deadline.'));
		controller.signal.throwIfAborted();
	};
	return {
		signal: controller.signal,
		abort: (reason) => controller.abort(reason),
		check,
		remaining: () => Math.max(1, end - Date.now()),
		async run(operation) {
			check();
			let aborted;
			try {
				return await Promise.race([
					Promise.resolve().then(operation),
					new Promise((_, reject) => {
						aborted = () => reject(controller.signal.reason);
						controller.signal.addEventListener('abort', aborted, { once: true });
					})
				]);
			} finally {
				controller.signal.removeEventListener('abort', aborted);
			}
		},
		stop: () => clearTimeout(timer)
	};
}

function nativePage(result, request) {
	const pages = result.structuredContent?.pages;
	if (!Array.isArray(pages)) fail('PRINT_PAGE', 'Native page list has no structured pages.');
	const matches = pages.filter((page) => page.url === request.expectedUrl);
	if (matches.length !== 1 || matches[0].id !== request.pageId)
		fail('PRINT_PAGE', 'Native page ID and unique exact report URL must agree.');
}

function nativeDocument(result) {
	const text =
		result.structuredContent?.message ??
		result.content
			?.filter((item) => item.type === 'text')
			.map((item) => item.text)
			.join('\n');
	const match = text?.match(/```json\s*([\s\S]*?)```/);
	if (!match) fail('PRINT_PAGE', 'Native document observation format changed.');
	return JSON.parse(match[1]);
}

async function outputDirectory(target) {
	let directory = repository;
	for (const segment of path.relative(repository, path.dirname(target)).split(path.sep)) {
		directory = path.join(directory, segment);
		try {
			await fs.mkdir(directory, { mode: 0o700 });
		} catch (error) {
			if (error.code !== 'EEXIST') throw error;
		}
		const stat = await fs.lstat(directory);
		if (!stat.isDirectory() || stat.isSymbolicLink()) fail('PRINT_PATH', 'PDF directories must not be symlinks.');
	}
	if ((await fs.realpath(directory)) !== directory) fail('PRINT_PATH', 'PDF directory must stay inside this checkout.');
	try {
		await fs.lstat(target);
	} catch (error) {
		if (error.code === 'ENOENT') return directory;
		throw error;
	}
	fail('PRINT_PATH', 'PDF output already exists; choose a new evidence name.');
}

export async function capturePrint(
	{ state, session, input, call },
	{
		inspectOwnership = ownedPrintEndpoint,
		connect = (options) => puppeteer.connect(options),
		deadlineMs = 20000,
		maxBytes = 20 * 1024 * 1024
	} = {}
) {
	const request = captureInput(input, state.origin);
	const clock = deadline(deadlineMs);
	let browser, page, cdp, stream, parent, partial, published;
	let succeeded = false;
	const changed = () => clock.abort(new Blocked('PRINT_PAGE', 'The report document changed or closed during capture.'));
	const navigated = (frame) => {
		if (frame === page.mainFrame()) changed();
	};
	try {
		const directory = await outputDirectory(request.target);
		clock.check();
		const endpoint = await clock.run(() => inspectOwnership(state, session));
		nativePage(await clock.run(() => call('list_pages', {}, clock.remaining())), request);
		const original = nativeDocument(
			await clock.run(() =>
				call(
					'evaluate_script',
					{
						pageId: request.pageId,
						function: documentState,
						waitForStableDom: false
					},
					clock.remaining()
				)
			)
		);
		if (original.url !== request.expectedUrl || original.ready !== 'complete' || !Number.isFinite(original.timeOrigin))
			fail('PRINT_PAGE', 'Use the completed, loaded report document.');
		const connecting = connect({
			browserWSEndpoint: endpoint,
			defaultViewport: null,
			protocolTimeout: clock.remaining()
		});
		connecting
			.then((late) => {
				if (clock.signal.aborted) return late.disconnect();
			})
			.catch(() => {});
		browser = await clock.run(() => connecting);
		const matches = (await clock.run(() => browser.pages())).filter(
			(entry) => !entry.isClosed() && entry.url() === request.expectedUrl
		);
		if (matches.length !== 1) fail('PRINT_PAGE', 'The report URL must identify one live owned page.');
		page = matches[0];
		page.on('close', changed);
		page.on('framenavigated', navigated);
		const checkDocument = async () => {
			clock.check();
			if (page.isClosed() || page.url() !== request.expectedUrl) changed();
			clock.check();
			const current = await clock.run(() =>
				page.evaluate(() => ({ url: location.href, timeOrigin: performance.timeOrigin, ready: document.readyState }))
			);
			if (current.url !== original.url || current.timeOrigin !== original.timeOrigin || current.ready !== 'complete')
				changed();
			clock.check();
		};
		await checkDocument();
		await clock.run(() =>
			page.evaluate(async () => {
				await document.fonts.ready;
			})
		);
		const attaching = page.createCDPSession();
		attaching
			.then((late) => {
				if (clock.signal.aborted) return late.detach();
			})
			.catch(() => {});
		cdp = await clock.run(() => attaching);
		({ stream } = await clock.run(() =>
			cdp.send('Page.printToPDF', {
				transferMode: 'ReturnAsStream',
				printBackground: true,
				preferCSSPageSize: true,
				displayHeaderFooter: false
			})
		));
		if (typeof stream !== 'string') fail('PRINT_PDF', 'Chromium did not return a print stream.');
		const chunks = [];
		let size = 0;
		for (;;) {
			const chunk = await clock.run(() => cdp.send('IO.read', { handle: stream, size: 65536 }));
			if (typeof chunk.data !== 'string') fail('PRINT_PDF', 'Chromium returned an invalid print chunk.');
			if (chunk.data.length > maxBytes * 2) fail('PRINT_SIZE', 'Print PDF exceeds the 20 MiB evidence limit.');
			const bytes = Buffer.from(chunk.data, chunk.base64Encoded ? 'base64' : 'utf8');
			size += bytes.length;
			if (size > maxBytes) fail('PRINT_SIZE', 'Print PDF exceeds the 20 MiB evidence limit.');
			chunks.push(bytes);
			if (chunk.eof) break;
		}
		await clock.run(() => cdp.send('IO.close', { handle: stream }));
		stream = undefined;
		const bytes = Buffer.concat(chunks);
		if (bytes.subarray(0, 5).toString() !== '%PDF-' || !bytes.subarray(-1024).toString().trimEnd().endsWith('%%EOF'))
			fail('PRINT_PDF', 'Chromium output is not a complete PDF.');
		await checkDocument();
		nativePage(await clock.run(() => call('list_pages', {}, clock.remaining())), request);
		if (
			(await clock.run(() => browser.pages())).filter(
				(entry) => !entry.isClosed() && entry.url() === request.expectedUrl
			).length !== 1
		)
			fail('PRINT_PAGE', 'The report URL became ambiguous during capture.');
		if ((await clock.run(() => inspectOwnership(state, session))) !== endpoint)
			fail('PRINT_OWNER', 'Print browser ownership changed during capture.');
		await outputDirectory(request.target);
		parent = await fs.open(directory, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
		const pinned = `/proc/self/fd/${parent.fd}`;
		partial = path.join(pinned, `.${path.basename(request.target)}.${randomUUID()}.part`);
		await fs.writeFile(partial, bytes, { flag: 'wx', mode: 0o600, signal: clock.signal });
		clock.check();
		const originalParent = await parent.stat();
		const checkOutputParent = async () => {
			const currentParent = await fs.stat(directory);
			if (
				(await fs.realpath(directory)) !== directory ||
				currentParent.ino !== originalParent.ino ||
				currentParent.dev !== originalParent.dev
			)
				fail('PRINT_PATH', 'PDF output directory changed during capture.');
		};
		await checkDocument();
		await checkOutputParent();
		clock.check();
		published = path.join(pinned, path.basename(request.target));
		await fs.link(partial, published);
		await checkOutputParent();
		const output = await fs.lstat(request.target);
		const temporary = await fs.stat(partial);
		if (!output.isFile() || output.ino !== temporary.ino || output.dev !== temporary.dev)
			fail('PRINT_PATH', 'PDF output changed during publication.');
		clock.check();
		succeeded = true;
		return {
			status: 'PASS',
			pageId: request.pageId,
			url: request.expectedUrl,
			candidate: state.candidate,
			session: state.id,
			saved: request.target,
			bytes: bytes.length,
			sha256: createHash('sha256').update(bytes).digest('hex')
		};
	} finally {
		clock.stop();
		page?.off('close', changed);
		page?.off('framenavigated', navigated);
		if (published && !succeeded) {
			const [output, temporary] = await Promise.all([
				fs.stat(published).catch(() => null),
				fs.stat(partial).catch(() => null)
			]);
			if (output && temporary && output.ino === temporary.ino && output.dev === temporary.dev)
				await fs.unlink(published);
		}
		if (partial) await fs.unlink(partial).catch(() => {});
		await parent?.close();
		const cleanup = async () => {
			try {
				if (stream) await cdp?.send('IO.close', { handle: stream });
			} catch {
				/* Disconnect also releases pending protocol operations. */
			}
			try {
				await cdp?.detach();
			} finally {
				await browser?.disconnect();
			}
		};
		let timer;
		try {
			await Promise.race([
				cleanup().catch(() => {}),
				new Promise((resolve) => {
					timer = setTimeout(resolve, 2000);
				})
			]);
		} finally {
			clearTimeout(timer);
			Promise.resolve(browser?.disconnect()).catch(() => {});
		}
	}
}
