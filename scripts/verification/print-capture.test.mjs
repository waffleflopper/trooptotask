import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';
import { capturePrint, ownedPrintEndpoint } from './print-capture.mjs';
import { repository } from './core.mjs';

const evidenceRoot = path.join(repository, '.verification/evidence/verify-trooptotask');
const reportUrl = 'http://127.0.0.1:43210/org/synthetic-a/training/reports?group=alpha&horizon=30';
const endpoint = 'ws://127.0.0.1:43211/devtools/browser/11111111-1111-1111-1111-111111111111';
const pdf = Buffer.from('%PDF-1.4\nOwned report literal\n%%EOF\n');
const tick = () => new Promise((resolve) => setImmediate(resolve));

async function fixture(t) {
	await fs.mkdir(evidenceRoot, { recursive: true });
	const directory = await fs.mkdtemp(path.join(evidenceRoot, 'print-test-'));
	t.after(() => fs.rm(directory, { recursive: true, force: true }));
	const target = path.join(directory, 'brief.pdf');
	const page = new EventEmitter();
	const frame = {};
	const document = { url: reportUrl, timeOrigin: 100, ready: 'complete' };
	page.url = () => document.url;
	page.isClosed = () => false;
	page.mainFrame = () => frame;
	page.evaluate = (fn) =>
		runInNewContext(`(${fn.toString()})()`, {
			location: { href: document.url },
			performance: { timeOrigin: document.timeOrigin },
			document: { readyState: document.ready, fonts: { ready: Promise.resolve() } }
		});
	const resources = { streamClosed: false, detached: false, disconnected: false };
	const cdp = {
		async send(method, options) {
			if (method === 'Page.printToPDF') {
				cdp.printOptions = options;
				return { stream: 'owned-stream' };
			}
			if (method === 'IO.read') return { data: pdf.toString('base64'), base64Encoded: true, eof: true };
			if (method === 'IO.close') {
				resources.streamClosed = true;
				return {};
			}
			throw new Error('Unexpected protocol operation');
		},
		async detach() {
			resources.detached = true;
		}
	};
	page.createCDPSession = async () => cdp;
	const otherPage = { url: () => reportUrl.replace('synthetic-a', 'synthetic-b'), isClosed: () => false };
	const browser = {
		pages: async () => [otherPage, page],
		async disconnect() {
			resources.disconnected = true;
		}
	};
	const nativePages = [
		{ id: 9, url: otherPage.url(), selected: true },
		{ id: 2, url: reportUrl, selected: false }
	];
	const call = async (name) =>
		name === 'list_pages'
			? { structuredContent: { pages: nativePages } }
			: {
					structuredContent: {
						message: 'Script ran on page and returned:\n```json\n' + JSON.stringify(document) + '\n```'
					}
				};
	const request = {
		state: { origin: 'http://127.0.0.1:43210', candidate: 'candidate-fixture', id: 'session-fixture' },
		session: directory,
		input: { command: 'print-capture', pageId: 2, expectedUrl: reportUrl, filePath: target },
		call
	};
	const options = { inspectOwnership: async () => endpoint, connect: async () => browser };
	return { directory, target, page, browser, cdp, document, nativePages, resources, request, options };
}

async function noOutput(f) {
	assert.deepEqual(await fs.readdir(f.directory), []);
	assert.equal(f.resources.disconnected, true);
	assert.equal(f.page.listenerCount('close'), 0);
	assert.equal(f.page.listenerCount('framenavigated'), 0);
}

test('print capture saves exact target bytes while another native page is selected', async (t) => {
	const f = await fixture(t);
	const result = await capturePrint(f.request, f.options);
	assert.deepEqual(await fs.readFile(f.target), pdf);
	assert.deepEqual(result, {
		status: 'PASS',
		pageId: 2,
		url: reportUrl,
		paperSize: 'letter',
		printBackground: true,
		candidate: 'candidate-fixture',
		session: 'session-fixture',
		saved: f.target,
		bytes: 36,
		sha256: '0e607dd563ff44bdbc36e2a5264cf619b61d745e94d685ea27b67c2e1df3119e'
	});
	assert.deepEqual(await fs.readdir(f.directory), ['brief.pdf']);
	assert.deepEqual(f.resources, { streamClosed: true, detached: true, disconnected: true });
	assert.equal(f.page.listenerCount('close'), 0);
});

test('report duty-role and repeated MOS filters remain part of the exact captured URL', async (t) => {
	const f = await fixture(t);
	const url = reportUrl + '&role=Medic&mos=68W&mos=11B';
	f.request.input.expectedUrl = url;
	f.document.url = url;
	f.nativePages[1].url = url;
	f.request.call = async (name) =>
		name === 'list_pages'
			? { structuredContent: { pages: f.nativePages } }
			: { content: [{ type: 'text', text: '```json\n' + JSON.stringify(f.document) + '\n```' }] };
	const result = await capturePrint(f.request, f.options);
	assert.equal(result.url, url);
	assert.deepEqual(await fs.readFile(f.target), pdf);
});

test('print input admits no generic endpoint, script, format, foreign URL or outside output', async (t) => {
	for (const change of [
		{ pageId: 0 },
		{ pageId: '2' },
		{ protocolEndpoint: endpoint },
		{ script: 'window.print()' },
		{ media: 'screen' },
		{ paperSize: 'legal' },
		{ paperSize: null },
		{ printBackground: 'off' },
		{ expectedUrl: reportUrl.replace('43210', '43212') },
		{ expectedUrl: reportUrl + '&access_token=private' },
		{ expectedUrl: reportUrl + '#part' },
		{ expectedUrl: 'http://127.0.0.1:43210/auth/login' },
		{ filePath: '../outside.pdf' },
		{ filePath: path.join(evidenceRoot, '../outside.pdf') },
		{ filePath: path.join(evidenceRoot, 'wrong.xlsx') }
	]) {
		const f = await fixture(t);
		Object.assign(f.request.input, change);
		await assert.rejects(capturePrint(f.request, f.options), (error) =>
			['PRINT_INPUT', 'PRINT_URL', 'PRINT_PATH'].includes(error.code)
		);
		assert.deepEqual(await fs.readdir(f.directory), []);
	}
});

for (const [paperSize, paperWidth, paperHeight] of [
	['letter', 8.5, 11],
	['a4', 210 / 25.4, 297 / 25.4]
]) {
	for (const printBackground of [true, false]) {
		test(`${paperSize} landscape capture honors backgrounds ${printBackground ? 'on' : 'off'}`, async (t) => {
			const f = await fixture(t);
			Object.assign(f.request.input, { paperSize, printBackground });
			const result = await capturePrint(f.request, f.options);
			assert.deepEqual(f.cdp.printOptions, {
				transferMode: 'ReturnAsStream',
				printBackground,
				landscape: true,
				paperWidth,
				paperHeight,
				preferCSSPageSize: true,
				displayHeaderFooter: false
			});
			assert.equal(result.paperSize, paperSize);
			assert.equal(result.printBackground, printBackground);
			assert.deepEqual(await fs.readFile(f.target), pdf);
		});
	}
}

test('print capture refuses existing output and a symlink directory without changing either', async (t) => {
	const f = await fixture(t);
	await fs.writeFile(f.target, 'original evidence');
	await assert.rejects(capturePrint(f.request, f.options), { code: 'PRINT_PATH' });
	assert.equal(await fs.readFile(f.target, 'utf8'), 'original evidence');
	await fs.unlink(f.target);
	const outside = path.join(f.directory, 'outside');
	await fs.mkdir(outside);
	const link = path.join(f.directory, 'linked');
	await fs.symlink(outside, link);
	f.request.input.filePath = path.join(link, 'brief.pdf');
	await assert.rejects(capturePrint(f.request, f.options), { code: 'PRINT_PATH' });
	assert.deepEqual(await fs.readdir(outside), []);
});

test('missing native ID, missing structured response and duplicate URLs fail closed', async (t) => {
	for (const kind of ['missing', 'unstructured', 'native-duplicate', 'connected-duplicate']) {
		const f = await fixture(t);
		if (kind === 'missing') f.request.input.pageId = 99;
		if (kind === 'unstructured')
			f.request.call = async () => ({ content: [{ type: 'text', text: '2: report [selected]' }] });
		if (kind === 'native-duplicate') f.nativePages.push({ id: 3, url: reportUrl });
		if (kind === 'connected-duplicate') f.browser.pages = async () => [f.page, f.page];
		await assert.rejects(capturePrint(f.request, f.options), { code: 'PRINT_PAGE' });
		assert.deepEqual(await fs.readdir(f.directory), []);
		if (kind === 'connected-duplicate') assert.equal(f.resources.disconnected, true);
	}
});

test('changed URL, same-URL reload and closure reject capture and settle temporary resources', async (t) => {
	for (const kind of ['url', 'reload', 'close', 'before-attachment']) {
		const f = await fixture(t);
		const originalSend = f.cdp.send;
		if (kind === 'before-attachment')
			f.options.connect = async () => {
				f.document.timeOrigin = 101;
				return f.browser;
			};
		else
			f.cdp.send = async (method, args) => {
				if (method === 'IO.read') {
					if (kind === 'url') f.document.url = reportUrl.replace('horizon=30', 'horizon=90');
					if (kind === 'reload') {
						f.document.timeOrigin = 101;
						f.page.emit('framenavigated', f.page.mainFrame());
					}
					if (kind === 'close') {
						f.page.isClosed = () => true;
						f.page.emit('close');
					}
				}
				return originalSend(method, args);
			};
		await assert.rejects(capturePrint(f.request, f.options), { code: 'PRINT_PAGE' });
		await noOutput(f);
		if (kind !== 'before-attachment') assert.equal(f.resources.streamClosed, true);
	}
});

test('oversized or incomplete print bytes never publish an artifact', async (t) => {
	for (const kind of ['oversized', 'incomplete']) {
		const f = await fixture(t);
		if (kind === 'oversized') f.options.maxBytes = 10;
		else {
			const send = f.cdp.send;
			f.cdp.send = async (method, args) =>
				method === 'IO.read' ? { data: '%PDF-1.4\npartial', eof: true } : send(method, args);
		}
		await assert.rejects(capturePrint(f.request, f.options), {
			code: kind === 'oversized' ? 'PRINT_SIZE' : 'PRINT_PDF'
		});
		await noOutput(f);
		assert.equal(f.resources.streamClosed, true);
	}
});

test('expired stream read cannot publish after a delayed response resolves', async (t) => {
	const f = await fixture(t);
	let finish;
	const reading = new Promise((resolve) => {
		finish = resolve;
	});
	const send = f.cdp.send;
	f.cdp.send = (method, args) => (method === 'IO.read' ? reading : send(method, args));
	f.options.deadlineMs = 100;
	await assert.rejects(capturePrint(f.request, f.options), { code: 'PRINT_TIMEOUT' });
	await noOutput(f);
	assert.equal(f.resources.streamClosed, true);
	finish({ data: pdf.toString('base64'), base64Encoded: true, eof: true });
	await tick();
	assert.deepEqual(await fs.readdir(f.directory), []);
});

test('a client connecting after the deadline disconnects and cannot create a file', async (t) => {
	const f = await fixture(t);
	let finish;
	f.options.connect = () =>
		new Promise((resolve) => {
			finish = resolve;
		});
	f.options.deadlineMs = 100;
	await assert.rejects(capturePrint(f.request, f.options), { code: 'PRINT_TIMEOUT' });
	finish(f.browser);
	await tick();
	await noOutput(f);
});

test('late ownership change or late duplicate target rejects already rendered bytes', async (t) => {
	for (const kind of ['ownership', 'duplicate']) {
		const f = await fixture(t);
		if (kind === 'ownership') {
			let first = true;
			f.options.inspectOwnership = async () => {
				if (first) {
					first = false;
					return endpoint;
				}
				return endpoint.replace('43211', '43212');
			};
		} else {
			const send = f.cdp.send;
			f.cdp.send = async (method, args) => {
				if (method === 'IO.read') f.nativePages.push({ id: 3, url: reportUrl });
				return send(method, args);
			};
		}
		await assert.rejects(capturePrint(f.request, f.options), {
			code: kind === 'ownership' ? 'PRINT_OWNER' : 'PRINT_PAGE'
		});
		await noOutput(f);
	}
});

test('document change after temporary output creation removes its partial file', async (t) => {
	const f = await fixture(t);
	const evaluate = f.page.evaluate;
	f.page.evaluate = async (fn) => {
		if ((await fs.readdir(f.directory)).some((name) => name.endsWith('.part'))) f.document.timeOrigin = 101;
		return evaluate(fn);
	};
	await assert.rejects(capturePrint(f.request, f.options), { code: 'PRINT_PAGE' });
	await noOutput(f);
});

test('moving the output directory during final document observation rejects publication and preserves its replacement', async (t) => {
	const f = await fixture(t);
	const relocation = await fs.mkdtemp(path.join(repository, '.verification/print-race-test-'));
	t.after(() => fs.rm(relocation, { recursive: true, force: true }));
	const moved = path.join(relocation, 'moved');
	const witness = Buffer.from('Replacement directory witness');
	const evaluate = f.page.evaluate;
	let replaced = false;
	f.page.evaluate = async (fn) => {
		if (!replaced && (await fs.readdir(f.directory)).some((name) => name.endsWith('.part'))) {
			replaced = true;
			await fs.rename(f.directory, moved);
			await fs.mkdir(f.directory);
			await fs.writeFile(path.join(f.directory, 'witness.txt'), witness);
		}
		return evaluate(fn);
	};
	await assert.rejects(capturePrint(f.request, f.options), { code: 'PRINT_PATH' });
	assert.equal(replaced, true);
	assert.deepEqual(await fs.readdir(moved), []);
	assert.deepEqual(await fs.readdir(f.directory), ['witness.txt']);
	assert.deepEqual(await fs.readFile(path.join(f.directory, 'witness.txt')), witness);
	assert.equal(f.resources.disconnected, true);
	assert.equal(f.page.listenerCount('close'), 0);
	assert.equal(f.page.listenerCount('framenavigated'), 0);
});

test('moving the directory as publication settles removes only the unaccepted PDF from its pinned directory', async (t) => {
	const f = await fixture(t);
	const relocation = await fs.mkdtemp(path.join(repository, '.verification/print-race-test-'));
	t.after(() => fs.rm(relocation, { recursive: true, force: true }));
	const moved = path.join(relocation, 'moved');
	const witness = Buffer.from('Existing replacement PDF');
	const link = fs.link;
	t.mock.method(fs, 'link', async (...args) => {
		await link(...args);
		await fs.rename(f.directory, moved);
		await fs.mkdir(f.directory);
		await fs.writeFile(f.target, witness);
	});
	await assert.rejects(capturePrint(f.request, f.options), { code: 'PRINT_PATH' });
	assert.deepEqual(await fs.readdir(moved), []);
	assert.deepEqual(await fs.readdir(f.directory), ['brief.pdf']);
	assert.deepEqual(await fs.readFile(f.target), witness);
	assert.equal(f.resources.disconnected, true);
});

test('private endpoint requires current identities, exact profile and owned loopback listener', async (t) => {
	const f = await fixture(t);
	const profile = path.join(f.directory, 'chrome-profile');
	const procRoot = path.join(f.directory, 'proc');
	await fs.mkdir(profile);
	await fs.writeFile(
		path.join(profile, 'DevToolsActivePort'),
		'43211\n/devtools/browser/11111111-1111-1111-1111-111111111111\n'
	);
	const browserProcess = {
		pid: 13,
		start: '100',
		command: `chromium\0--user-data-dir=${profile}\0--remote-debugging-port=0\0`
	};
	const state = {
		phase: 'running',
		repository,
		browserProcess,
		supervisor: { pid: 11, start: '90', command: 'owned-supervisor\0' },
		mcpProcess: { pid: 12, start: '95', command: 'owned-mcp\0' }
	};
	const records = new Map(
		[state.supervisor, state.mcpProcess, state.browserProcess].map((entry) => [entry.pid, { ...entry, state: 'S' }])
	);
	const options = { procRoot, identity: async (pid) => records.get(pid) };
	const processRoot = path.join(procRoot, '13');
	await fs.mkdir(path.join(processRoot, 'fd'), { recursive: true });
	await fs.mkdir(path.join(processRoot, 'net'));
	await fs.symlink('socket:[12345]', path.join(processRoot, 'fd/1'));
	const table = (address = '0100007F', inode = '12345') =>
		`header\n0: ${address}:A8CB 00000000:0000 0A 0:0 00:0 0 1000 0 ${inode}\n`;
	await fs.writeFile(path.join(processRoot, 'net/tcp'), table());
	await fs.writeFile(path.join(processRoot, 'net/tcp6'), 'header\n');
	assert.equal(await ownedPrintEndpoint(state, f.directory, options), endpoint);
	for (const pid of [11, 12, 13]) {
		const original = records.get(pid);
		records.set(pid, { ...original, start: 'replaced' });
		await assert.rejects(ownedPrintEndpoint(state, f.directory, options), { code: 'PRINT_OWNER' });
		records.set(pid, original);
	}
	const originalBrowser = records.get(13);
	records.set(13, { ...originalBrowser, command: originalBrowser.command + '--another-command\0' });
	await assert.rejects(ownedPrintEndpoint(state, f.directory, options), { code: 'PRINT_OWNER' });
	records.set(13, originalBrowser);
	for (const invalid of [table('00000000'), table('0100007F', '99999'), 'header\n']) {
		await fs.writeFile(path.join(processRoot, 'net/tcp'), invalid);
		await assert.rejects(ownedPrintEndpoint(state, f.directory, options), { code: 'PRINT_ENDPOINT' });
	}
	await fs.writeFile(path.join(processRoot, 'net/tcp'), table());
	await fs.writeFile(path.join(processRoot, 'net/tcp6'), table('00000000000000000000000000000000'));
	await assert.rejects(ownedPrintEndpoint(state, f.directory, options), { code: 'PRINT_ENDPOINT' });
	await fs.writeFile(path.join(processRoot, 'net/tcp6'), 'header\n');
	for (const invalid of [
		'0\n/devtools/browser/11111111-1111-1111-1111-111111111111',
		'43211\nws://other-host/private',
		'43211\n/devtools/browser/------------------------------------'
	]) {
		await fs.writeFile(path.join(profile, 'DevToolsActivePort'), invalid);
		await assert.rejects(ownedPrintEndpoint(state, f.directory, options), { code: 'PRINT_ENDPOINT' });
	}
	await fs.writeFile(
		path.join(profile, 'DevToolsActivePort'),
		'43212\n/devtools/browser/11111111-1111-1111-1111-111111111111'
	);
	await assert.rejects(ownedPrintEndpoint(state, f.directory, options), { code: 'PRINT_ENDPOINT' });
	state.browserProcess = { ...browserProcess, command: browserProcess.command.replace(profile, '/other-profile') };
	records.set(13, { ...state.browserProcess, state: 'S' });
	await assert.rejects(ownedPrintEndpoint(state, f.directory, options), { code: 'PRINT_OWNER' });
});
