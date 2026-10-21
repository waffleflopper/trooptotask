import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

// A timed sample is contaminated when the host's 1-minute load exceeds 4 at any reading, or
// when another checkout's build, test or verification processes use a quarter of one core in
// any tick. Across the D01 r3 run, readings with no such process stayed at or below load 2.5 in
// 95% of cases (5.5 at the 99th percentile) on this 16-thread host, and one Training report
// sample that overlapped another worktree's full check (load 10 to 12) ran 34% above its
// batch's median.
export const hostLimits = { load1: 4, otherCpuPercent: 25, tickMs: 2000, clearWaitMs: 30 * 60_000 };

// Linux reports process CPU time in USER_HZ, which is 100 on every architecture Node supports.
const ticksPerSecond = 100;
const tools =
	/\b(vite|vitest|svelte-check|svelte-kit|playwright|eslint|prettier|tsc|esbuild|daemon\.mjs|control\.mjs|unittest)\b|\bnode\b.*\s--test(?:[\s=]|$)|trooptotask-verification/;

export function isOtherTool({ args, cwd }, ours) {
	if (!tools.test(args)) return false;
	const inside = (text) => ours.some((root) => text === root || text.includes(root + path.sep));
	return !inside(args) && !inside(cwd ?? '');
}

/**
 * Verdict over host readings taken during one sample: each reading has its time, 1-minute load
 * and the cumulative CPU ticks of every other checkout's tool process by PID.
 */
export function hostVerdict(readings, limits = hostLimits) {
	const load1Max = Math.max(...readings.map((reading) => reading.load1));
	let otherCpuPercent = 0;
	const busy = new Set();
	for (let index = 1; index < readings.length; index++) {
		const [earlier, later] = [readings[index - 1], readings[index]];
		const seconds = (later.at - earlier.at) / 1000;
		if (seconds <= 0) continue;
		let percent = 0;
		for (const [pid, { ticks, args }] of Object.entries(later.others)) {
			const used = ((ticks - (earlier.others[pid]?.ticks ?? ticks)) / ticksPerSecond / seconds) * 100;
			if (used >= 1) busy.add(args.slice(0, 120));
			percent += used;
		}
		otherCpuPercent = Math.max(otherCpuPercent, Math.round(percent));
	}
	const reasons = [
		...(load1Max > limits.load1 ? [`load ${load1Max} above ${limits.load1}`] : []),
		...(otherCpuPercent >= limits.otherCpuPercent
			? [`other checkouts' tools at ${otherCpuPercent}% of one core: ${[...busy].join('; ')}`]
			: [])
	];
	return { clean: reasons.length === 0, load1Max, otherCpuPercent, reasons };
}

async function readHost(ours) {
	const load1 = Number((await fs.readFile('/proc/loadavg', 'utf8')).split(' ')[0]);
	const others = {};
	for (const pid of (await fs.readdir('/proc')).filter((name) => /^\d+$/.test(name))) {
		try {
			const args = (await fs.readFile(`/proc/${pid}/cmdline`, 'utf8')).replaceAll('\0', ' ').trim();
			if (!tools.test(args)) continue;
			const cwd = await fs.readlink(`/proc/${pid}/cwd`).catch(() => null);
			if (!isOtherTool({ args, cwd }, ours)) continue;
			const stat = await fs.readFile(`/proc/${pid}/stat`, 'utf8');
			const fields = stat.slice(stat.lastIndexOf(')') + 2).split(' ');
			others[pid] = { ticks: Number(fields[11]) + Number(fields[12]), args };
		} catch {
			// The process ended between the listing and the read.
		}
	}
	return { at: Date.now(), load1, others };
}

// A run compares with another only on the same browser build and kernel. The browser reports
// its build through Browser.getVersion, which DevTools also serves as /json/version on the
// owned endpoint; reading the running process catches a package upgrade under a live browser.
export async function hostBuild(
	endpoint,
	{
		getJson = async (url) => (await fetch(url, { signal: AbortSignal.timeout(5000) })).json(),
		release = os.release
	} = {}
) {
	const version = await getJson(`http://${new URL(endpoint).host}/json/version`);
	return { browser: version.Browser, protocol: version['Protocol-Version'], kernel: release() };
}

export function hostMonitor(ours, { limits = hostLimits, endpoint } = {}) {
	return {
		build: async () => hostBuild(await endpoint()),
		/** Waits until a 3 s look at the host is clean; returns how long it waited. */
		async clear() {
			const started = Date.now();
			for (;;) {
				const first = await readHost(ours);
				await new Promise((resolve) => setTimeout(resolve, 3000));
				const verdict = hostVerdict([first, await readHost(ours)], limits);
				if (verdict.clean) return Date.now() - started;
				if (Date.now() - started > limits.clearWaitMs)
					throw new Error(
						`The host stayed busy for ${limits.clearWaitMs / 60000} minutes: ${verdict.reasons.join('; ')}.`
					);
				await new Promise((resolve) => setTimeout(resolve, 12000));
			}
		},
		/** Reads the host now and every tick until stop(), which returns the verdict with the wall-clock span. */
		async watch() {
			const readings = [await readHost(ours)];
			const startedAt = new Date(readings[0].at).toISOString();
			let pending = Promise.resolve();
			const timer = setInterval(() => {
				pending = pending.then(async () => readings.push(await readHost(ours)));
			}, limits.tickMs);
			return {
				async stop() {
					clearInterval(timer);
					await pending;
					readings.push(await readHost(ours));
					return { startedAt, endedAt: new Date(readings.at(-1).at).toISOString(), ...hostVerdict(readings, limits) };
				}
			};
		}
	};
}
