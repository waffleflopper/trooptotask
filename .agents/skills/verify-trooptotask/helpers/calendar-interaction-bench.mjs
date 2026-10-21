#!/usr/bin/env node
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execute = promisify(execFile);
const here = path.dirname(fileURLToPath(import.meta.url));
const repository = path.resolve(here, '../../../..');

export const BLOCKS = ['search', 'group', 'nav-within', 'nav-past-next', 'nav-past-prev', 'view', 'modal', 'popover'];

export const INTERACTIONS = {
	'search-type': 'Type one character into the personnel search',
	'search-clear': 'Clear the personnel search',
	'group-select': 'Choose the Bravo group filter',
	'group-clear': 'Choose Group: All',
	'next-within': 'Next month inside the loaded range',
	'prev-within': 'Previous month inside the loaded range',
	'next-past': 'Next month past the loaded range (range request)',
	'prev-past': 'Previous month past the loaded range (range request)',
	'to-3-month': 'Month to 3-Month',
	'to-month': '3-Month to Month',
	'modal-open': 'Open the availability modal from a day cell',
	'popover-open': 'Open the first status bar popover'
};

/**
 * Runs inside the page: one block of interactions, each repeated `warmup + reps` times.
 * Latency is performance.now() before the DOM event to the second requestAnimationFrame
 * after the expected change is present, so it includes at most one frame of quantization.
 * It has no free variables and is sent to the page as source text.
 */
export async function runBlock(config) {
	const { block, warmup, reps, idleMs, timeoutMs, searchTerm, anchorLabel, otherGroup } = config;
	const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
	const frame = () => new Promise((resolve) => requestAnimationFrame(resolve));
	const visible = (element) =>
		Boolean(element) &&
		Boolean(element.offsetParent || element.getClientRects().length) &&
		!element.closest('[aria-hidden="true"]');
	const all = (selector) => [...document.querySelectorAll(selector)];
	const STATUS_CELLS_OR_BARS = '.status-cell, .roster-rows [data-slot="status-bar"]';
	const firstVisible = (selector) => all(selector).find(visible);
	const buttonNamed = (text) => all('button').find((button) => visible(button) && button.textContent.trim() === text);
	const labelled = (name) => firstVisible(`[aria-label="${name}"]`);
	const monthLabel = () => document.querySelector('[data-testid="calendar-month-label"]')?.textContent.trim() ?? null;
	const longRangeLabel = () => document.querySelector('[data-testid="long-range-date-label"]');
	const personNames = () =>
		all('.virtual-row--person .personnel-row > button:first-child').map((button) =>
			button.textContent.replace(/\s+/g, ' ').trim()
		);
	const groupHeaders = () => all('.virtual-row--group').map((row) => row.textContent.trim());
	const monthName = (label) => label.split(' ')[0];
	const shiftLabel = (label, delta) => {
		const [name, year] = label.split(' ');
		const month = new Date(`${name} 1, ${year}`).getMonth();
		return new Date(Number(year), month + delta, 1).toLocaleString('en-US', { month: 'long', year: 'numeric' });
	};
	const firstCellInMonth = (label) => {
		const cell = document.querySelector('[data-slot="date-cell"]');
		return Boolean(cell) && cell.getAttribute('aria-label').includes(`${monthName(label)} 1, ${label.split(' ')[1]}`);
	};
	const nodeCounts = () => ({
		total: document.getElementsByTagName('*').length,
		grid: document.querySelectorAll('.virtual-row *').length,
		dateCells: document.querySelectorAll('[data-slot="date-cell"]').length,
		statusCells: document.querySelectorAll(STATUS_CELLS_OR_BARS).length,
		virtualRows: document.querySelectorAll('.virtual-row').length
	});

	const longTasks = [];
	const resources = [];
	const faults = { jsErrors: 0, unhandledRejections: 0, consoleErrors: 0 };
	const taskObserver = new PerformanceObserver((list) => longTasks.push(...list.getEntries()));
	taskObserver.observe({ type: 'longtask' });
	const resourceObserver = new PerformanceObserver((list) => resources.push(...list.getEntries()));
	resourceObserver.observe({ type: 'resource' });
	const onError = () => (faults.jsErrors += 1);
	const onRejection = () => (faults.unhandledRejections += 1);
	window.addEventListener('error', onError);
	window.addEventListener('unhandledrejection', onRejection);
	const originalConsoleError = console.error;
	console.error = (...args) => {
		faults.consoleErrors += 1;
		originalConsoleError.apply(console, args);
	};
	const flush = () => {
		longTasks.push(...taskObserver.takeRecords());
		resources.push(...resourceObserver.takeRecords());
	};

	const typeInto = (term) => {
		const input = firstVisible('input[type="search"][aria-label^="Search by name"]');
		input.focus();
		input.value = term;
		input.dispatchEvent(
			new InputEvent('input', {
				bubbles: true,
				data: term || null,
				inputType: term ? 'insertText' : 'deleteContentBackward'
			})
		);
	};
	const chooseGroup = async (name) => {
		const trigger = labelled('Calendar group filter');
		trigger.dispatchEvent(
			new PointerEvent('pointerdown', {
				bubbles: true,
				cancelable: true,
				button: 0,
				pointerType: 'mouse',
				isPrimary: true
			})
		);
		let option;
		for (let waited = 0; !option && waited < 2000; waited += 25) {
			await sleep(25);
			option = all('[role="option"]').find((candidate) => candidate.textContent.trim().startsWith(name));
		}
		if (!option) throw new Error(`group option ${name} not found`);
		return () => {
			option.dispatchEvent(
				new PointerEvent('pointerup', {
					bubbles: true,
					cancelable: true,
					button: 0,
					pointerType: 'mouse',
					isPrimary: true
				})
			);
			option.click();
		};
	};
	const dialog = () =>
		all('[role="dialog"]').find((element) => visible(element) && element.textContent.includes('Set Personnel Status'));

	const measure = async (id, action, ready, extra = {}) => {
		await sleep(idleMs);
		await frame();
		await frame();
		flush();
		longTasks.length = 0;
		resources.length = 0;
		faults.jsErrors = faults.unhandledRejections = faults.consoleErrors = 0;
		const sequence = `${id}:${performance.now().toFixed(0)}`;
		performance.mark(`bench:${sequence}:start`);
		const start = performance.now();
		let error = null;
		let paintedAt = null;
		let domMs = null;
		try {
			action();
			await Promise.resolve();
			await Promise.resolve();
			domMs = performance.now() - start;
			await frame();
			while (!ready()) {
				if (performance.now() - start > timeoutMs) throw new Error('expected change never rendered');
				await frame();
			}
			await frame();
			paintedAt = performance.now();
		} catch (caught) {
			error = String(caught?.message ?? caught);
		}
		performance.mark(`bench:${sequence}:end`);
		const record = {
			id,
			ms: paintedAt === null ? null : paintedAt - start,
			domMs,
			error
		};
		if (extra.settled) {
			try {
				const rangeSeen = () => {
					flush();
					return resources.some((entry) => entry.name.includes('calendar-range'));
				};
				while (!rangeSeen()) {
					if (performance.now() - start > timeoutMs) throw new Error('range request never completed');
					await frame();
				}
				await frame();
				await frame();
				record.settledMs = performance.now() - start;
			} catch (caught) {
				record.error = record.error ?? String(caught?.message ?? caught);
			}
		}
		await sleep(idleMs);
		flush();
		const within = (entry) => entry.startTime >= start - 1 && (paintedAt === null || entry.startTime <= paintedAt);
		const during = longTasks.filter(within);
		record.longTasks = {
			count: during.length,
			totalMs: during.reduce((sum, entry) => sum + entry.duration, 0),
			maxMs: during.reduce((max, entry) => Math.max(max, entry.duration), 0)
		};
		const dataJson = resources.filter((entry) => entry.name.includes('__data.json')).length;
		const calendarRange = resources.filter((entry) => entry.name.includes('calendar-range')).length;
		record.requests = {
			total: resources.length,
			dataJson,
			calendarRange,
			other: resources.length - dataJson - calendarRange,
			failed: resources.filter((entry) => entry.responseStatus >= 400).length,
			rangeMs: resources.filter((entry) => entry.name.includes('calendar-range')).map((entry) => entry.duration)
		};
		record.nodes = nodeCounts();
		record.faults = { ...faults };
		if (extra.detail) record.detail = extra.detail();
		return record;
	};

	const waitFor = async (condition, what) => {
		const start = performance.now();
		while (!condition()) {
			if (performance.now() - start > timeoutMs) throw new Error(`setup: ${what}`);
			await frame();
		}
	};
	const toMonthView = async () => {
		if (longRangeLabel()) {
			buttonNamed('Month').click();
			await waitFor(() => !longRangeLabel() && document.querySelector('[data-slot="date-cell"]'), 'Month view');
		}
	};
	const reset = async () => {
		await toMonthView();
		if (dialog()) {
			document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
			await waitFor(() => !dialog(), 'dialog closed');
		}
		if (firstVisible('input[type="search"][aria-label^="Search by name"]')?.value) {
			typeInto('');
			await waitFor(
				() => firstVisible('input[type="search"][aria-label^="Search by name"]').value === '',
				'search cleared'
			);
		}
		if (!labelled('Calendar group filter').textContent.trim().startsWith('Group: All')) {
			(await chooseGroup('Group: All'))();
			await waitFor(
				() => labelled('Calendar group filter').textContent.trim().startsWith('Group: All'),
				'group cleared'
			);
		}
		if (monthLabel() !== anchorLabel) {
			buttonNamed('Today').click();
			await waitFor(() => monthLabel() === anchorLabel && firstCellInMonth(anchorLabel), 'anchor month');
		}
		await sleep(idleMs);
	};

	const out = [];
	const record = (value, round) => out.push({ ...value, round, warmup: round < warmup });
	const rounds = warmup + reps;
	const searchReady = () => {
		const names = personNames();
		return names.length > 0 && names.every((name) => name.includes(searchTerm));
	};
	const names = (limit = 3) => personNames().slice(0, limit);

	try {
		if (document.visibilityState !== 'visible')
			throw new Error('page is not visible; requestAnimationFrame would be throttled');
		await reset();
		if (block === 'search') {
			for (let round = 0; round < rounds; round += 1) {
				record(
					await measure('search-type', () => typeInto(searchTerm), searchReady, {
						detail: () => ({ first: names(), rows: personNames().length })
					}),
					round
				);
				record(
					await measure(
						'search-clear',
						() => typeInto(''),
						() => !searchReady() && personNames().length > 0,
						{
							detail: () => ({ first: names(), rows: personNames().length })
						}
					),
					round
				);
			}
		} else if (block === 'group') {
			const headerIs = (name) => () => {
				const headers = groupHeaders();
				return (
					headers.length > 0 &&
					headers[0].toUpperCase().includes(name.toUpperCase()) &&
					!headers.some((header) => header.toUpperCase().includes('ALPHA') && name !== 'Alpha')
				);
			};
			for (let round = 0; round < rounds; round += 1) {
				let select = await chooseGroup(otherGroup);
				record(
					await measure(
						'group-select',
						select,
						() => labelled('Calendar group filter').textContent.includes(otherGroup) && headerIs(otherGroup)(),
						{
							detail: () => ({ headers: groupHeaders().slice(0, 2), rows: personNames().length })
						}
					),
					round
				);
				select = await chooseGroup('Group: All');
				record(
					await measure(
						'group-clear',
						select,
						() => labelled('Calendar group filter').textContent.trim().startsWith('Group: All') && headerIs('Alpha')(),
						{
							detail: () => ({ headers: groupHeaders().slice(0, 2), rows: personNames().length })
						}
					),
					round
				);
			}
		} else if (block === 'nav-within') {
			for (let round = 0; round < rounds; round += 1) {
				const next = shiftLabel(anchorLabel, 1);
				record(
					await measure(
						'next-within',
						() => labelled('Next month').click(),
						() => monthLabel() === next && firstCellInMonth(next),
						{ detail: () => ({ label: monthLabel() }) }
					),
					round
				);
				record(
					await measure(
						'prev-within',
						() => labelled('Previous month').click(),
						() => monthLabel() === anchorLabel && firstCellInMonth(anchorLabel),
						{ detail: () => ({ label: monthLabel() }) }
					),
					round
				);
			}
		} else if (block === 'nav-past-next' || block === 'nav-past-prev') {
			const direction = block === 'nav-past-next' ? 1 : -1;
			const button = direction === 1 ? 'Next month' : 'Previous month';
			const step = async (offset) => {
				const target = shiftLabel(anchorLabel, offset);
				labelled(button).click();
				await waitFor(() => monthLabel() === target && firstCellInMonth(target), `month ${target}`);
			};
			await step(direction);
			for (let round = 0; round < rounds; round += 1) {
				const target = shiftLabel(anchorLabel, direction * (round + 2));
				record(
					await measure(
						direction === 1 ? 'next-past' : 'prev-past',
						() => labelled(button).click(),
						() => monthLabel() === target && firstCellInMonth(target),
						{
							settled: true,
							detail: () => ({ label: monthLabel() })
						}
					),
					round
				);
			}
		} else if (block === 'view') {
			for (let round = 0; round < rounds; round += 1) {
				record(
					await measure(
						'to-3-month',
						() => buttonNamed('3-Month').click(),
						() => Boolean(longRangeLabel()) && document.querySelectorAll(STATUS_CELLS_OR_BARS).length > 0,
						{
							detail: () => ({ label: longRangeLabel()?.textContent.trim() })
						}
					),
					round
				);
				record(
					await measure(
						'to-month',
						() => buttonNamed('Month').click(),
						() => !longRangeLabel() && monthLabel() === anchorLabel && firstCellInMonth(anchorLabel),
						{
							detail: () => ({ label: monthLabel() })
						}
					),
					round
				);
			}
		} else if (block === 'modal') {
			const [year] = [anchorLabel.split(' ')[1]];
			const cell = () =>
				all('[data-slot="date-cell"]').find(
					(element) =>
						element.getAttribute('aria-label').includes(config.modalPerson) &&
						element.getAttribute('aria-label').includes(`${monthName(anchorLabel)} ${config.modalDay}, ${year}`)
				);
			if (!cell()) throw new Error(`no day cell for ${config.modalPerson}`);
			for (let round = 0; round < rounds; round += 1) {
				record(
					await measure(
						'modal-open',
						() => cell().click(),
						() => Boolean(dialog()),
						{ detail: () => ({ title: dialog()?.querySelector('#availability-title')?.textContent.trim() }) }
					),
					round
				);
				document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
				await waitFor(() => !dialog(), 'dialog closed');
			}
		} else if (block === 'popover') {
			const bar = () => document.querySelector('[data-slot="bar-track"] button[data-entry-id]');
			const popovers = () => all('[data-slot="popover-content"][role="dialog"]').filter(visible);
			if (!bar()) throw new Error('no availability bar on this revision');
			for (let round = 0; round < rounds; round += 1) {
				// Only a popover this click opened, for the bar it expanded, proves the interaction.
				let earlier = [];
				const opened = () =>
					bar().getAttribute('aria-expanded') === 'true'
						? popovers().find((element) => !earlier.includes(element))
						: undefined;
				record(
					await measure(
						'popover-open',
						() => {
							earlier = popovers();
							bar().click();
						},
						() => Boolean(opened()),
						{ detail: () => ({ title: opened()?.getAttribute('aria-label') }) }
					),
					round
				);
				const popover = opened();
				if (popover) {
					popover.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
					await waitFor(() => !popover.isConnected || !visible(popover), 'popover closed');
				}
			}
		} else throw new Error(`unknown block ${block}`);
		await reset();
	} catch (caught) {
		out.push({ id: `${block}:setup`, error: String(caught?.message ?? caught), round: -1, warmup: false });
	} finally {
		taskObserver.disconnect();
		resourceObserver.disconnect();
		window.removeEventListener('error', onError);
		window.removeEventListener('unhandledrejection', onRejection);
		console.error = originalConsoleError;
	}
	return out;
}

export function readPageFacts() {
	const resources = performance.getEntriesByType('resource').map((entry) => entry.name);
	const group = [...document.querySelectorAll('[aria-label="Calendar group filter"]')].find(
		(element) => element.offsetParent
	);
	return {
		userAgent: navigator.userAgent,
		hardwareConcurrency: navigator.hardwareConcurrency,
		viewport: [innerWidth, innerHeight],
		devicePixelRatio: devicePixelRatio,
		visibility: document.visibilityState,
		dark: document.documentElement.dataset.theme === 'dark' || document.documentElement.classList.contains('dark'),
		immutableAssets: resources.filter((name) => name.includes('/_app/immutable/')).length,
		devAssets: resources.filter((name) => /@vite|\/node_modules\/\.vite|\/@fs\//.test(name)).length,
		monthLabel: document.querySelector('[data-testid="calendar-month-label"]')?.textContent.trim() ?? null,
		dateCells: document.querySelectorAll('[data-slot="date-cell"]').length,
		virtualRows: document.querySelectorAll('.virtual-row').length,
		domNodes: document.getElementsByTagName('*').length,
		groupFilter: group?.textContent.trim() ?? null
	};
}

export async function readRoster() {
	const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
	const trigger = [...document.querySelectorAll('[aria-label="Calendar group filter"]')].find(
		(element) => element.offsetParent
	);
	trigger.dispatchEvent(
		new PointerEvent('pointerdown', {
			bubbles: true,
			cancelable: true,
			button: 0,
			pointerType: 'mouse',
			isPrimary: true
		})
	);
	await sleep(300);
	const groups = [...document.querySelectorAll('[role="option"]')]
		.map((option) => /^(.*) \((\d+)\)$/.exec(option.textContent.trim()))
		.filter(Boolean)
		.map(([, name, count]) => ({ name, count: Number(count) }));
	document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
	await sleep(300);
	return {
		groups,
		total: groups.reduce((sum, group) => sum + group.count, 0),
		menuClosed: document.querySelectorAll('[role="option"]').length === 0
	};
}

export function median(values) {
	if (values.length === 0) return null;
	const sorted = [...values].sort((a, b) => a - b);
	const middle = Math.floor(sorted.length / 2);
	return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

const round = (value, digits = 1) => (value === null || value === undefined ? null : Number(value.toFixed(digits)));

export function summarizeRun(records) {
	const rows = {};
	for (const id of Object.keys(INTERACTIONS)) {
		const measured = records.filter((record) => record.id === id && !record.warmup);
		if (measured.length === 0) continue;
		const good = measured.filter((record) => !record.error && record.ms !== null);
		const values = good.map((record) => record.ms);
		const pick = (selector) => median(good.map(selector));
		rows[id] = {
			n: good.length,
			attempted: measured.length,
			errors: measured.filter((record) => record.error).length,
			failedRequests: measured.reduce((sum, record) => sum + (record.requests?.failed ?? 0), 0),
			jsFaults: measured.reduce(
				(sum, record) => sum + Object.values(record.faults ?? {}).reduce((a, b) => a + b, 0),
				0
			),
			medianMs: round(median(values)),
			domMedianMs: round(median(good.map((record) => record.domMs))),
			minMs: good.length ? round(Math.min(...values)) : null,
			maxMs: good.length ? round(Math.max(...values)) : null,
			settledMedianMs: round(median(good.map((record) => record.settledMs).filter((value) => value !== undefined))),
			longTaskCountMedian: pick((record) => record.longTasks.count),
			longTaskTotalMsMedian: round(pick((record) => record.longTasks.totalMs)),
			longTaskMaxMs: good.length ? round(Math.max(...good.map((record) => record.longTasks.maxMs))) : null,
			requestsMedian: pick((record) => record.requests.total),
			rangeRequestsMedian: pick((record) => record.requests.calendarRange),
			dataJsonRequestsMedian: pick((record) => record.requests.dataJson),
			gridNodesMedian: pick((record) => record.nodes.grid),
			domNodesMedian: pick((record) => record.nodes.total),
			dateCellsMedian: pick((record) => record.nodes.dateCells),
			statusCellsMedian: pick((record) => record.nodes.statusCells)
		};
	}
	return rows;
}

export function table(rows) {
	const header =
		'| interaction | n | median ms | min–max ms | JS+DOM ms (median) | long tasks (median count / total ms) | requests (median) | grid nodes | errors |';
	const lines = [header, '|---|---|---|---|---|---|---|---|---|'];
	for (const [id, row] of Object.entries(rows)) {
		const settled = row.settledMedianMs === null ? '' : ` (settled ${row.settledMedianMs})`;
		const cell = (value) => value ?? 'n/a';
		lines.push(
			`| ${id} | ${row.n}/${row.attempted} | ${cell(row.medianMs)}${settled} | ${cell(row.minMs)}–${cell(row.maxMs)} | ${cell(row.domMedianMs)} | ${cell(row.longTaskCountMedian)} / ${cell(row.longTaskTotalMsMedian)} | ${cell(row.requestsMedian)} | ${cell(row.gridNodesMedian)} | ${row.errors} failed UI, ${row.failedRequests} failed requests, ${row.jsFaults} JS faults |`
		);
	}
	return lines.join('\n');
}

function parse(argv) {
	const options = {
		worker: '1',
		reps: 9,
		warmup: 2,
		label: 'run',
		idleMs: 350,
		timeoutMs: 8000,
		searchTerm: '7',
		otherGroup: 'Bravo',
		modalPerson: 'Volume010',
		modalDay: 10,
		cpuThrottle: 1
	};
	const positional = [];
	for (let index = 0; index < argv.length; index += 1) {
		const argument = argv[index];
		if (!argument.startsWith('--')) positional.push(argument);
		else {
			const key = argument.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
			options[key] = argv[(index += 1)];
		}
	}
	for (const key of ['reps', 'warmup', 'idleMs', 'timeoutMs', 'modalDay', 'cpuThrottle'])
		options[key] = Number(options[key]);
	return { options, positional };
}

async function cli(worker, args) {
	const { stdout } = await execute('node', ['scripts/verification/cli.mjs', ...args, '--worker', worker], {
		cwd: repository,
		maxBuffer: 256 * 1024 * 1024
	});
	return JSON.parse(stdout);
}

async function tool(worker, name, input) {
	const result = await cli(worker, ['tool', name, JSON.stringify(input)]);
	return result.structuredContent ?? result;
}

async function evaluate(worker, pageId, source, argument) {
	const call = argument === undefined ? `(${source})()` : `(${source})(${JSON.stringify(argument)})`;
	const result = await tool(worker, 'evaluate_script', { pageId, function: `async () => ${call}` });
	const match = /```json\n([\s\S]*)\n```/.exec(result.message ?? '');
	if (!match) throw new Error(`evaluate_script returned no JSON: ${JSON.stringify(result).slice(0, 400)}`);
	return JSON.parse(match[1]);
}

async function capture(command, args) {
	try {
		return (await execute(command, args, { cwd: repository })).stdout.trim();
	} catch (error) {
		return `unavailable: ${error.message.split('\n')[0]}`;
	}
}

async function machine() {
	const cpus = os.cpus();
	return {
		uptime: await capture('uptime', []),
		nproc: await capture('nproc', []),
		cpu: cpus[0]?.model,
		loadAverage: os.loadavg(),
		memoryGiB: Math.round(os.totalmem() / 2 ** 30),
		node: process.version,
		kernel: os.release()
	};
}

async function run(options) {
	const { worker } = options;
	const doctor = await cli(worker, ['doctor']);
	if (doctor.status !== 'PASS')
		throw new Error(`doctor is ${doctor.status}; resolve before driving: ${JSON.stringify(doctor)}`);
	const started = new Date().toISOString();
	const environment = {
		started,
		label: options.label,
		machine: await machine(),
		browser: doctor.browser?.version,
		origin: doctor.origin,
		candidateDigest: doctor.candidate,
		revision: doctor.revision,
		productTree: await capture('git', ['rev-parse', 'HEAD:src']),
		harnessCommit: await capture('git', ['rev-parse', 'HEAD']),
		workingTreeClean: (await capture('git', ['status', '--porcelain'])) === ''
	};
	const driver = options.page
		? { pageId: Number(options.page) }
		: await (async () => {
				const { stdout } = await execute(
					'node',
					[
						'.agents/skills/verify-trooptotask/helpers/control.mjs',
						'--worker',
						worker,
						'actor',
						'calendarOperate',
						'calendar'
					],
					{ cwd: repository }
				);
				return JSON.parse(stdout);
			})();
	const pageId = driver.pageId;
	const keepsPage = Boolean(options.page) || options.keepPage === 'true';
	try {
		await tool(worker, 'select_page', { pageId });
		await tool(worker, 'resize_page', { pageId, width: 1440, height: 900 });
		await tool(worker, 'emulate', {
			pageId,
			colorScheme: 'light',
			...(options.cpuThrottle > 1 ? { cpuThrottlingRate: options.cpuThrottle } : {})
		});
		await tool(worker, 'navigate_page', { pageId, type: 'reload' });
		const ready = `() => document.querySelectorAll('[data-slot="date-cell"]').length > 0 && [...document.querySelectorAll('[aria-label="Calendar group filter"]')].some((e) => e.offsetParent && /\\(\\d+\\)|Group/.test(e.textContent))`;
		for (let attempt = 0; ; attempt += 1) {
			if (await evaluate(worker, pageId, ready)) break;
			if (attempt > 120) throw new Error('Calendar never rendered after reload');
			await new Promise((resolve) => setTimeout(resolve, 500));
		}
		await new Promise((resolve) => setTimeout(resolve, 2000));
		const facts = await evaluate(worker, pageId, readPageFacts.toString());
		if (facts.dark) throw new Error('page is dark; the harness requires light');
		if (facts.devAssets > 0 || facts.immutableAssets === 0)
			throw new Error(`page is not a production build: ${JSON.stringify(facts)}`);
		const roster = await evaluate(worker, pageId, readRoster.toString());
		if (roster.total < 500) throw new Error(`roster has ${roster.total} people; seed availability-volume first`);
		facts.roster = roster;
		const config = { ...options, anchorLabel: facts.monthLabel };
		const blocks = options.only ? options.only.split(',') : BLOCKS;
		const records = [];
		for (const block of blocks) {
			const loadBefore = os.loadavg()[0];
			const result = await evaluate(worker, pageId, runBlock.toString(), { ...config, block });
			records.push(...result);
			process.stderr.write(
				`${block}: ${result.filter((record) => !record.warmup && !record.error).length} measured, ${result.filter((record) => record.error).length} errors, load ${loadBefore.toFixed(2)}\n`
			);
		}
		environment.finished = new Date().toISOString();
		environment.loadAverageAfter = os.loadavg();
		environment.page = facts;
		environment.config = {
			reps: options.reps,
			warmup: options.warmup,
			idleMs: options.idleMs,
			timeoutMs: options.timeoutMs,
			searchTerm: options.searchTerm,
			otherGroup: options.otherGroup,
			modalPerson: options.modalPerson,
			modalDay: options.modalDay,
			viewport: '1440x900',
			colorScheme: 'light',
			cpuThrottle: options.cpuThrottle
		};
		return { environment, summary: summarizeRun(records), records };
	} finally {
		// A failed run must not leave the worker's page slowed or open for the next step.
		const cleanup = keepsPage
			? options.cpuThrottle > 1 && tool(worker, 'emulate', { pageId, cpuThrottlingRate: 1 })
			: tool(worker, 'close_page', { pageId });
		await Promise.resolve(cleanup).catch((error) => process.stderr.write(`page cleanup failed: ${error.message}\n`));
	}
}

async function main() {
	const [command, ...rest] = process.argv.slice(2);
	const { options, positional } = parse(rest);
	if (command === 'run') {
		const result = await run(options);
		const out = options.out
			? path.resolve(options.out)
			: path.join(
					repository,
					'.verification/evidence/verify-trooptotask',
					`calendar-bench-${options.label}-${Date.now()}`
				);
		await fs.mkdir(out, { recursive: true });
		await fs.writeFile(path.join(out, `${options.label}.json`), JSON.stringify(result, null, 2));
		await fs.writeFile(path.join(out, `${options.label}.md`), table(result.summary) + '\n');
		process.stdout.write(`${table(result.summary)}\n\nwrote ${path.join(out, `${options.label}.json`)}\n`);
		return;
	}
	if (command === 'summarize') {
		const labelled = new Map();
		for (const argument of positional) {
			const file = argument.includes('=') ? argument.split('=')[1] : argument;
			const label = argument.includes('=') ? argument.split('=')[0] : path.basename(file, '.json');
			const parsed = JSON.parse(await fs.readFile(file, 'utf8'));
			labelled.set(label, [...(labelled.get(label) ?? []), parsed]);
		}
		for (const [label, runs] of labelled) {
			const merged = runs.flatMap((parsed) => parsed.records);
			process.stdout.write(
				`### ${label} (${runs.length} run${runs.length === 1 ? '' : 's'}, records pooled)\n\n${table(summarizeRun(merged))}\n\n`
			);
		}
		return;
	}
	process.stderr.write(
		[
			'Usage:',
			'  calendar-interaction-bench.mjs run --worker 2 --label A [--out DIR] [--reps 9] [--warmup 2] [--only search,group,...] [--page ID] [--cpu-throttle 4] [--keep-page true]',
			'  calendar-interaction-bench.mjs summarize A=a1.json B=b1.json A=a2.json B=b2.json',
			'Seed first: control.mjs --worker N seed availability-volume'
		].join('\n') + '\n'
	);
	process.exitCode = 2;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
