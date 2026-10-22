import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { commandArguments, toolArguments, toolOutput, runTool } from './cli-output.mjs';
import { SnapshotFormatter } from '../../node_modules/chrome-devtools-mcp/build/src/formatters/SnapshotFormatter.js';
import { interactByRole } from './browser.mjs';
import {
	assertCurrentCandidate,
	assertWorkerSession,
	candidateSnapshot,
	changedCandidatePaths,
	processIdentity,
	repository
} from './core.mjs';

test('worker flags override the environment and invalid workers fail before a command runs', () => {
	assert.deepEqual(commandArguments(['doctor'], { VERIFY_WORKER: '2' }), { worker: '2', args: ['doctor'] });
	assert.deepEqual(commandArguments(['doctor', '--worker', '1'], { VERIFY_WORKER: '2' }), {
		worker: '1',
		args: ['doctor']
	});
	assert.deepEqual(commandArguments(['doctor'], {}), { worker: '1', args: ['doctor'] });
	for (const input of [
		['doctor', '--worker'],
		['doctor', '--worker', '3']
	])
		assert.throws(() => commandArguments(input, {}), { code: 'WORKER' });
});

test('tool output unwraps all text blocks and saves exactly the printed evidence', async () => {
	const root = await fs.mkdtemp(path.join(os.tmpdir(), 'verify-output-'));
	try {
		const file = path.join(root, 'evidence/run/snapshot.txt');
		const options = toolArguments(['take_snapshot', '{"pageId":7}', '--text', '--save', file]);
		assert.equal(options.name, 'take_snapshot');
		assert.deepEqual(options.args, { pageId: 7 });
		const result = {
			content: [
				{ type: 'text', text: 'button "Save"' },
				{ type: 'image', data: 'ignored' },
				{ type: 'text', text: 'textbox "Name"' }
			]
		};
		assert.equal(await toolOutput(result, options, path.join(root, 'evidence')), 'button "Save"\ntextbox "Name"');
		assert.equal(await fs.readFile(file, 'utf8'), 'button "Save"\ntextbox "Name"\n');
		assert.equal(
			await toolOutput({ status: 'BLOCKED', code: 'STALE_CANDIDATE' }, { text: true }, root),
			'{\n  "status": "BLOCKED",\n  "code": "STALE_CANDIDATE"\n}'
		);
		await assert.rejects(toolOutput(result, { save: path.join(root, 'outside.txt') }, path.join(root, 'evidence')), {
			code: 'EVIDENCE_PATH'
		});
		assert.throws(() => toolArguments(['take_snapshot', '--save']), { code: 'ARGUMENTS' });
	} finally {
		await fs.rm(root, { recursive: true, force: true });
	}
});

test('role actions use fresh native structured names, including quotes, and refuse ambiguity', async () => {
	let children = [
		{ id: '1_1', role: 'button', name: 'Save" extra words', children: [] },
		{ id: '1_2', role: 'button', name: 'Save', children: [] },
		{ id: '1_3', role: 'button', name: 'Complete Review "ABC"', children: [] }
	];
	const effects = [];
	const call = async (action, args) => {
		if (action === 'take_snapshot') {
			const formatter = new SnapshotFormatter({ root: { id: 'root', role: 'RootWebArea', children } });
			return {
				content: [{ type: 'text', text: formatter.toString() }],
				structuredContent: { snapshot: formatter.toJSON() }
			};
		}
		effects.push({ action, ...args });
	};
	await interactByRole(call, 'click', { pageId: 7, role: 'button', name: 'Save' });
	await interactByRole(call, 'click', { pageId: 7, role: 'button', name: 'Complete Review "ABC"' });
	children = [{ id: '2_1', role: 'textbox', name: 'Name', children: [] }];
	await interactByRole(call, 'fill', { pageId: 7, role: 'textbox', name: 'Name', value: 'Synthetic' });
	assert.deepEqual(effects, [
		{ action: 'click', pageId: 7, uid: '1_2' },
		{ action: 'click', pageId: 7, uid: '1_3' },
		{ action: 'fill', pageId: 7, uid: '2_1', value: 'Synthetic' }
	]);
	for (const names of [[], ['Save', 'Save'], ['Save" extra words']]) {
		children = names.map((name, index) => ({ id: `3_${index}`, role: 'button', name, children: [] }));
		await assert.rejects(interactByRole(call, 'click', { pageId: 7, role: 'button', name: 'Save' }), {
			code: 'LOCATOR'
		});
	}
	assert.equal(effects.length, 3);
});

test('a rejected save path dispatches no tool action', async () => {
	let clicked = false;
	await assert.rejects(
		runTool(
			['click', '{"uid":"1_2","pageId":7}', '--save', '/tmp/not-evidence.txt'],
			async () => {
				clicked = true;
				return { content: [] };
			},
			'/owned/evidence'
		),
		{ code: 'EVIDENCE_PATH' }
	);
	assert.equal(clicked, false);
});

test('candidate diagnostics identify edited, deleted and newly added paths', async () => {
	const root = await fs.mkdtemp(path.join(os.tmpdir(), 'verify-paths-'));
	try {
		await fs.writeFile(path.join(root, 'package.json'), '{"original":true}');
		const before = await candidateSnapshot(root);
		await fs.writeFile(path.join(root, 'package.json'), '{"changed":true}');
		const after = await candidateSnapshot(root);
		const changed = changedCandidatePaths(before.files, after.files);
		assert.deepEqual(changed, ['package.json']);
		assert.throws(
			() =>
				assertCurrentCandidate(
					{ candidate: before.digest, artifact: before.digest },
					after.digest,
					before.digest,
					changed
				),
			(error) => error.code === 'STALE_CANDIDATE' && error.message.includes('package.json')
		);
		assert.deepEqual(
			changedCandidatePaths({ 'deleted.js': 'a', 'edited.js': 'b' }, { 'new.js': 'c', 'edited.js': 'd' }),
			['deleted.js', 'edited.js', 'new.js']
		);
	} finally {
		await fs.rm(root, { recursive: true, force: true });
	}
});

test('checkout additions do not attribute a change to the untouched owned artifact', async () => {
	const root = await fs.mkdtemp(path.join(os.tmpdir(), 'verify-manifest-'));
	try {
		const checkout = path.join(root, 'checkout');
		const artifact = path.join(root, 'app');
		for (const folder of [checkout, artifact]) {
			await fs.mkdir(folder);
			await fs.writeFile(path.join(folder, 'package.json'), '{}');
		}
		const before = await candidateSnapshot(checkout, ['package.json']);
		await fs.writeFile(path.join(checkout, 'added.js'), 'export default 1;');
		const current = await candidateSnapshot(checkout, ['package.json', 'added.js']);
		const copy = await candidateSnapshot(artifact, Object.keys(before.files));
		assert.deepEqual(changedCandidatePaths(before.files, current.files), ['added.js']);
		assert.deepEqual(changedCandidatePaths(before.files, copy.files), []);
		assert.equal(copy.digest, before.digest);
		await fs.unlink(path.join(checkout, 'package.json'));
		const removed = await candidateSnapshot(checkout, ['package.json', 'added.js']);
		assert.deepEqual(changedCandidatePaths(before.files, removed.files), ['added.js', 'package.json']);
	} finally {
		await fs.rm(root, { recursive: true, force: true });
	}
});

test('a live launch is distinct from foreign ownership or an ended session', async () => {
	const state = { repository, worker: '2', phase: 'starting', supervisor: await processIdentity(process.pid) };
	await assert.rejects(async () => assertWorkerSession(state, '2'), { code: 'LAUNCH_PENDING' });
	await assert.rejects(async () => assertWorkerSession({ ...state, repository: '/other' }, '2'), { code: 'OWNERSHIP' });
	await assert.rejects(async () => assertWorkerSession({ ...state, phase: 'cleaned' }, '2'), { code: 'OWNERSHIP' });
	await assert.doesNotReject(async () => assertWorkerSession({ ...state, phase: 'running', controlPort: 43000 }, '2'));
});

test('launcher identity reports pending before the supervisor registers', async () => {
	const session = await fs.mkdtemp(path.join(os.tmpdir(), 'verify-launch-'));
	try {
		await fs.writeFile(
			path.join(session, 'launcher.json'),
			JSON.stringify({ identity: await processIdentity(process.pid) })
		);
		await assert.rejects(
			async () => assertWorkerSession({ repository, worker: '2', phase: 'starting' }, '2', session),
			{
				code: 'LAUNCH_PENDING'
			}
		);
	} finally {
		await fs.rm(session, { recursive: true, force: true });
	}
});

test('an interrupted launch directs cleanup instead of waiting for a dead or replaced process', async () => {
	const session = await fs.mkdtemp(path.join(os.tmpdir(), 'verify-launch-'));
	const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)']);
	try {
		await once(child, 'spawn');
		const identity = await processIdentity(child.pid);
		const exited = once(child, 'exit');
		child.kill('SIGKILL');
		await exited;
		const current = await processIdentity(process.pid);
		for (const supervisor of [identity, { ...current, start: 'replaced' }, { ...current, command: 'replaced' }]) {
			await fs.writeFile(path.join(session, 'launcher.json'), JSON.stringify({ identity: supervisor }));
			for (const state of [
				{ repository, worker: '2', phase: 'starting', supervisor },
				{ repository, worker: '2', phase: 'starting' }
			])
				await assert.rejects(
					async () => assertWorkerSession(state, '2', session),
					(error) => {
						assert.equal(error.code, 'LAUNCH_EXITED');
						assert.match(error.message, /cleanup --worker 2/);
						return true;
					}
				);
		}
		await fs.unlink(path.join(session, 'launcher.json'));
		await assert.rejects(
			async () => assertWorkerSession({ repository, worker: '2', phase: 'starting' }, '2', session),
			{
				code: 'LAUNCH_EXITED'
			}
		);
	} finally {
		if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
		await fs.rm(session, { recursive: true, force: true });
	}
});
