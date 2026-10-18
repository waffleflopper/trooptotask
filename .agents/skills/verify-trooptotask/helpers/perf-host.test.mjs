import assert from 'node:assert/strict';
import { test } from 'node:test';
import { hostBuild, hostVerdict, isOtherTool } from './perf-host.mjs';

const ours = ['/work/t3-ours', '/state/trooptotask-verification/aaaa'];

test("another checkout's build, test or verification process is other; ours and unrelated programs are not", () => {
	const cases = [
		[{ args: 'node /work/t3-theirs/node_modules/.bin/vitest run', cwd: '/work/t3-theirs' }, true],
		[{ args: 'node /work/t3-theirs/node_modules/.bin/svelte-check', cwd: '/work/t3-theirs' }, true],
		[{ args: 'chromium --user-data-dir=/state/trooptotask-verification/bbbb/chrome', cwd: '/' }, true],
		[{ args: 'node /work/t3-ours/node_modules/.bin/vite preview', cwd: '/work/t3-ours' }, false],
		[{ args: 'chromium --user-data-dir=/state/trooptotask-verification/aaaa/chrome', cwd: '/' }, false],
		[{ args: 'node node_modules/.bin/eslint .', cwd: '/work/t3-ours/sub' }, false],
		[{ args: 'node /work/t3-ours-copy/node_modules/.bin/tsc', cwd: '/work/t3-ours-copy' }, true],
		[{ args: 'chromium --user-data-dir=/home/me/.config/chromium', cwd: '/home/me' }, false],
		[
			{
				args: '/usr/bin/node --test .agents/skills/verify-trooptotask/helpers/perf-host.test.mjs',
				cwd: '/work/t3-theirs'
			},
			true
		],
		[{ args: 'python3 -m unittest discover -s scripts/ci -p test_*.py', cwd: '/work/t3-theirs' }, true],
		[{ args: '/usr/bin/node --test-reporter=spec', cwd: '/work/t3-theirs' }, false],
		[{ args: 'node --test helpers/perf-host.test.mjs', cwd: '/work/t3-ours' }, false]
	];
	assert.deepEqual(
		cases.map(([process]) => isOtherTool(process, ours)),
		cases.map(([, expected]) => expected)
	);
});

test('a quiet host is clean', () => {
	const verdict = hostVerdict([
		{ at: 0, load1: 1.2, others: { 7: { ticks: 500, args: 'vite preview' } } },
		{ at: 2000, load1: 1.4, others: { 7: { ticks: 502, args: 'vite preview' } } }
	]);
	assert.deepEqual(verdict, { clean: true, load1Max: 1.4, otherCpuPercent: 1, reasons: [] });
});

test('load above 4 at any reading, or other tools at a quarter core in any tick, contaminates the sample', () => {
	const verdict = hostVerdict([
		{ at: 0, load1: 3.9, others: { 7: { ticks: 100, args: 'node vitest run' } } },
		{ at: 2000, load1: 4.3, others: { 7: { ticks: 110, args: 'node vitest run' } } },
		{
			at: 4000,
			load1: 3.1,
			others: { 7: { ticks: 170, args: 'node vitest run' }, 9: { ticks: 40, args: 'node eslint .' } }
		}
	]);
	assert.deepEqual(verdict, {
		clean: false,
		load1Max: 4.3,
		otherCpuPercent: 30,
		reasons: ['load 4.3 above 4', "other checkouts' tools at 30% of one core: node vitest run"]
	});
});

test('a sample shorter than one tick is judged from its start and end readings', () => {
	assert.deepEqual(
		hostVerdict([
			{ at: 0, load1: 2, others: { 7: { ticks: 0, args: 'node vitest run' } } },
			{ at: 400, load1: 2, others: { 7: { ticks: 20, args: 'node vitest run' } } }
		]),
		{
			clean: false,
			load1Max: 2,
			otherCpuPercent: 50,
			reasons: ["other checkouts' tools at 50% of one core: node vitest run"]
		}
	);
});

test("the host build is the running browser's /json/version on its owned endpoint and the kernel release", async () => {
	const asked = [];
	const build = await hostBuild('ws://127.0.0.1:41234/devtools/browser/0b0c4a3e-1d2f-4e5a-8b9c-0d1e2f3a4b5c', {
		getJson: async (url) => {
			asked.push(url);
			return { Browser: 'Chrome/154.0.8037.97', 'Protocol-Version': '1.3', 'V8-Version': '15.4.1' };
		},
		release: () => '7.2.8-9-omarchy'
	});
	assert.deepEqual(asked, ['http://127.0.0.1:41234/json/version']);
	assert.deepEqual(build, { browser: 'Chrome/154.0.8037.97', protocol: '1.3', kernel: '7.2.8-9-omarchy' });
});
