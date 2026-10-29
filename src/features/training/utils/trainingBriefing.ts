import type { Personnel } from '$features/personnel/contracts';
import type { TrainingStatus, TrainingType } from '$features/training/training.types';
import { formatDate, parseDate } from '$lib/utils/dates';
import { filterPersonnel } from './reportCalculations';
import { getTrainingStatus } from './trainingStatus';
import type {
	BriefingAxisTick,
	BriefingBand,
	BriefingForecast,
	BriefingFocus,
	BriefingFocusArea,
	BriefingGrid,
	BriefingGridCell,
	BriefingGridRow,
	BriefingLegendItem,
	BriefingReadiness,
	BriefingRequirement,
	BriefingRowsBy,
	BriefingScope,
	BriefingTypeRisk,
	FocusCandidateKey,
	TrainingBriefing,
	TrainingBriefingInput,
	TrainingColumnGaps,
	TrainingMatrixGaps,
	TrainingReadinessInput,
	TrainingReadinessSummary
} from './trainingBriefing.types';

export type {
	TrainingColumnGaps,
	TrainingMatrixGaps,
	TrainingReadinessInput,
	TrainingReadinessSummary
} from './trainingBriefing.types';

const READY_STATES: ReadonlySet<TrainingStatus> = new Set(['current', 'warning-yellow', 'warning-orange']);
const BUCKET_DAYS = 7;
const DROP_ALERT_POINTS = 10;
const MAX_FOCUS_AREAS = 3;
const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const LONG_MONTHS = [
	'January',
	'February',
	'March',
	'April',
	'May',
	'June',
	'July',
	'August',
	'September',
	'October',
	'November',
	'December'
];

interface Entry {
	requirement: BriefingRequirement;
	person: Personnel;
	column: number;
	lapseOffset: number | null;
}

interface Row {
	key: string;
	label: string;
	soldierCount: number;
	entries: Entry[];
}

interface Cliff {
	firstBucket: number;
	lastBucket: number;
	startOffset: number;
	endOffset: number;
	entries: Entry[];
	highlighted: boolean;
	dominantColumns: number[];
}

interface Analysis {
	input: TrainingBriefingInput;
	population: Personnel[];
	columns: TrainingType[];
	entries: Entry[];
	rows: Row[];
	horizonEnd: string;
	bucketEnds: number[];
	bucketLapses: number[];
	cliff: Cliff | null;
}

interface Candidate {
	area: BriefingFocusArea;
	order: number;
	name: string;
	entries: Entry[];
}

function addDays(isoDate: string, days: number): string {
	const date = parseDate(isoDate);
	date.setDate(date.getDate() + days);
	return formatDate(date);
}

function dayLabel(isoDate: string): string {
	const date = parseDate(isoDate);
	return `${date.getDate()} ${SHORT_MONTHS[date.getMonth()]}`;
}

function fullDateLabel(isoDate: string): string {
	return `${dayLabel(isoDate)} ${parseDate(isoDate).getFullYear()}`;
}

function percent(part: number, whole: number): number | null {
	return whole === 0 ? null : Math.round((part * 100) / whole);
}

function compareText(a: string, b: string): number {
	return a < b ? -1 : a > b ? 1 : 0;
}

export function bandFor(ready: number, applicable: number, goal: number): BriefingBand {
	if (applicable === 0) return 'none';
	const scaled = ready * 100;
	if (scaled >= goal * applicable) return 'goal';
	if (scaled >= (goal - 10) * applicable) return 'near';
	if (scaled >= (goal - 20) * applicable) return 'below';
	if (scaled >= (goal - 30) * applicable) return 'far';
	return 'critical';
}

function legendFor(goal: number): BriefingLegendItem[] {
	const legend: BriefingLegendItem[] = [{ band: 'goal', label: `${goal}+` }];
	const steps: Array<{ band: BriefingLegendItem['band']; below: number }> = [
		{ band: 'near', below: 10 },
		{ band: 'below', below: 20 },
		{ band: 'far', below: 30 }
	];
	for (const step of steps) {
		const high = goal - step.below + 10;
		if (high <= 0) continue;
		const low = Math.max(0, goal - step.below);
		const label = low === 0 ? `<${high}` : low % 10 === 0 && high - low === 10 ? `${low}s` : `${low}–${high - 1}`;
		legend.push({ band: step.band, label });
	}
	if (goal > 30) legend.push({ band: 'critical', label: `<${goal - 30}` });
	return legend;
}

function readiness(ready: number, applicable: number, goal: number): BriefingReadiness {
	return { ready, applicable, percent: percent(ready, applicable), band: bandFor(ready, applicable, goal) };
}

function isReadyAt(entry: Entry, offset: number): boolean {
	return entry.requirement.readyToday && (entry.lapseOffset === null || entry.lapseOffset > offset);
}

function countReadyAt(entries: Entry[], offset: number): number {
	return entries.filter((entry) => isReadyAt(entry, offset)).length;
}

function isAffected(entry: Entry): boolean {
	return !entry.requirement.readyToday || entry.requirement.lapsesInHorizon;
}

function distinctPeople(entries: Entry[]): number {
	return new Set(entries.map((entry) => entry.person.id)).size;
}

function joinNames(names: string[]): string {
	return names.join(' and ');
}

function soldiers(count: number): string {
	return `${count} ${count === 1 ? 'soldier' : 'soldiers'}`;
}

function rowIdentity(person: Personnel, rowsBy: BriefingRowsBy): { key: string; label: string } {
	if (rowsBy === 'group') return { key: person.groupId ?? 'unassigned', label: person.groupName || 'Unassigned' };
	if (rowsBy === 'mos') return { key: person.mos, label: person.mos || 'No MOS' };
	return { key: person.clinicRole, label: person.clinicRole || 'No duty role' };
}

function rankColumnsByCount(entries: Entry[]): Array<{ column: number; count: number }> {
	const counts = new Map<number, number>();
	for (const entry of entries) counts.set(entry.column, (counts.get(entry.column) ?? 0) + 1);
	return [...counts]
		.map(([column, count]) => ({ column, count }))
		.sort((a, b) => b.count - a.count || a.column - b.column);
}

function dominantColumns(windowEntries: Entry[]): number[] {
	const [first, second] = rankColumnsByCount(windowEntries);
	const needed = 6 * windowEntries.length;
	if (first.count * 10 >= needed) return [first.column];
	if (second && (first.count + second.count) * 10 >= needed) return [first.column, second.column];
	return [];
}

function findCliff(bucketEnds: number[], bucketLapses: number[], lapsing: Entry[]): Cliff | null {
	if (lapsing.length === 0) return null;
	const size = Math.max(1, Math.round(bucketEnds.length / 4));
	let firstBucket = 0;
	let best = -1;
	for (let start = 0; start + size <= bucketEnds.length; start++) {
		const sum = bucketLapses.slice(start, start + size).reduce((total, lapses) => total + lapses, 0);
		if (sum > best) {
			best = sum;
			firstBucket = start;
		}
	}
	const lastBucket = firstBucket + size - 1;
	const startOffset = firstBucket === 0 ? 0 : bucketEnds[firstBucket - 1];
	const endOffset = bucketEnds[lastBucket];
	const entries = lapsing.filter(
		(entry) => entry.lapseOffset !== null && entry.lapseOffset > startOffset && entry.lapseOffset <= endOffset
	);
	return {
		firstBucket,
		lastBucket,
		startOffset,
		endOffset,
		entries,
		highlighted: best >= 5 && best * 10 >= lapsing.length * 4,
		dominantColumns: dominantColumns(entries)
	};
}

function requirementEntries(input: TrainingReadinessInput, rowsBy: BriefingRowsBy = 'group'): Entry[] {
	const records = new Map(input.records.map((record) => [`${record.personnelId}-${record.trainingTypeId}`, record]));
	const entries: Entry[] = [];

	for (const person of input.personnel) {
		const identity = rowIdentity(person, rowsBy);
		input.types.forEach((type, column) => {
			const record = records.get(`${person.id}-${type.id}`);
			const status = getTrainingStatus(record, type, person, input.asOf);
			if (status.status === 'not-required' || status.status === 'exempt') return;
			const readyToday = READY_STATES.has(status.status);
			const lapseOffset = readyToday && status.daysUntilExpiration !== null ? status.daysUntilExpiration + 1 : null;
			const entry: Entry = {
				person,
				column,
				lapseOffset,
				requirement: {
					personId: person.id,
					typeId: type.id,
					rowKey: identity.key,
					status: status.status,
					label: status.label,
					completionDate: record?.completionDate ?? null,
					expirationDate: record?.expirationDate ?? null,
					readyToday,
					lapseDate: lapseOffset === null ? null : addDays(input.asOf, lapseOffset),
					lapsesInHorizon: lapseOffset !== null && lapseOffset <= input.horizonDays
				}
			};
			entries.push(entry);
		});
	}
	return entries;
}

function analyze(input: TrainingBriefingInput): Analysis {
	const population = filterPersonnel(input.personnel, input.filters);
	const selectedTypeIds = input.filters.trainingTypeIds ?? [];
	const columns = input.types.filter(
		(type) => !type.isOptional && (selectedTypeIds.length === 0 || selectedTypeIds.includes(type.id))
	);
	const entries = requirementEntries({ ...input, personnel: population, types: columns }, input.rowsBy);
	const rows = new Map<string, Row>();
	for (const person of population) {
		const identity = rowIdentity(person, input.rowsBy);
		const row = rows.get(identity.key) ?? { ...identity, soldierCount: 0, entries: [] };
		row.soldierCount += 1;
		rows.set(identity.key, row);
	}
	for (const entry of entries) rows.get(entry.requirement.rowKey)?.entries.push(entry);
	const horizonDays = input.horizonDays;

	const bucketEnds: number[] = [];
	for (let end = BUCKET_DAYS; end < horizonDays; end += BUCKET_DAYS) bucketEnds.push(end);
	bucketEnds.push(horizonDays);
	const lapsing = entries.filter((entry) => entry.requirement.lapsesInHorizon);
	const bucketLapses = bucketEnds.map((end, index) => {
		const start = index === 0 ? 0 : bucketEnds[index - 1];
		return lapsing.filter(
			(entry) => entry.lapseOffset !== null && entry.lapseOffset > start && entry.lapseOffset <= end
		).length;
	});

	return {
		input,
		population,
		columns,
		entries,
		rows: [...rows.values()],
		horizonEnd: addDays(input.asOf, horizonDays),
		bucketEnds,
		bucketLapses,
		cliff: findCliff(bucketEnds, bucketLapses, lapsing)
	};
}

function cliffRange(analysis: Analysis, cliff: Cliff): { start: string; end: string } {
	return {
		start: dayLabel(addDays(analysis.input.asOf, cliff.startOffset + 1)),
		end: dayLabel(addDays(analysis.input.asOf, cliff.endOffset))
	};
}

function axisTicks(asOf: string, horizonEnd: string): BriefingAxisTick[] {
	const ticks: BriefingAxisTick[] = [{ date: asOf, label: `Today · ${dayLabel(asOf)}` }];
	const month = parseDate(asOf);
	month.setDate(1);
	for (month.setMonth(month.getMonth() + 1); formatDate(month) < horizonEnd; month.setMonth(month.getMonth() + 1)) {
		ticks.push({ date: formatDate(month), label: dayLabel(formatDate(month)) });
	}
	ticks.push({ date: horizonEnd, label: dayLabel(horizonEnd) });
	return ticks;
}

function buildForecast(analysis: Analysis): BriefingForecast {
	const { input, entries, bucketEnds, bucketLapses, cliff } = analysis;
	const ticks = axisTicks(input.asOf, analysis.horizonEnd);
	const pointOffsets = [0, ...bucketEnds];
	const points = pointOffsets.map((offset) => {
		const date = addDays(input.asOf, offset);
		const ready = countReadyAt(entries, offset);
		return { date, label: dayLabel(date), ready, percent: percent(ready, entries.length) };
	});
	const buckets = bucketEnds.map((end, index) => {
		const startDate = addDays(input.asOf, (index === 0 ? 0 : bucketEnds[index - 1]) + 1);
		const endDate = addDays(input.asOf, end);
		return {
			startDate,
			endDate,
			label: `${dayLabel(startDate)} – ${dayLabel(endDate)}`,
			lapses: bucketLapses[index],
			inCliff: cliff !== null && cliff.highlighted && index >= cliff.firstBucket && index <= cliff.lastBucket
		};
	});
	if (cliff === null) return { goalPercent: input.goalPercent, axisTicks: ticks, points, buckets, cliff: null };

	const range = cliffRange(analysis, cliff);
	const typeNames = joinNames(cliff.dominantColumns.map((column) => analysis.columns[column].name));
	const lapsingCount = bucketLapses.reduce((total, lapses) => total + lapses, 0);
	return {
		goalPercent: input.goalPercent,
		axisTicks: ticks,
		points,
		buckets,
		cliff: {
			startDate: addDays(input.asOf, cliff.startOffset + 1),
			endDate: addDays(input.asOf, cliff.endOffset),
			label: `${range.start} – ${range.end}`,
			caption: typeNames ? `${cliff.entries.length} lapse · ${typeNames}` : `${cliff.entries.length} lapse`,
			lapses: cliff.entries.length,
			sharePercent: Math.round((cliff.entries.length * 100) / lapsingCount),
			highlighted: cliff.highlighted,
			dominantTypeIds: cliff.dominantColumns.map((column) => analysis.columns[column].id)
		}
	};
}

function summarize(entries: Entry[], horizonDays: number, goal: number) {
	const readyToday = countReadyAt(entries, 0);
	const readyAtHorizon = countReadyAt(entries, horizonDays);
	const lost = readyToday - readyAtHorizon;
	return {
		today: readiness(readyToday, entries.length, goal),
		horizon: readiness(readyAtHorizon, entries.length, goal),
		drop: percent(lost, entries.length),
		dropAlert: lost > 0 && lost * 100 >= DROP_ALERT_POINTS * entries.length
	};
}

function gridRow(
	key: string | null,
	label: string,
	soldierCount: number,
	entries: Entry[],
	analysis: Analysis
): BriefingGridRow {
	const { horizonDays, goalPercent } = analysis.input;
	const cells: BriefingGridCell[] = analysis.columns.map((type, column) => {
		const cell = summarize(
			entries.filter((entry) => entry.column === column),
			horizonDays,
			goalPercent
		);
		return { typeId: type.id, ...cell };
	});
	const { today, horizon, drop } = summarize(entries, horizonDays, goalPercent);
	return { key, label, soldierCount, cells, today, horizon, drop };
}

function compareRowsByReadiness(a: BriefingGridRow, b: BriefingGridRow): number {
	const aEmpty = a.today.applicable === 0;
	const bEmpty = b.today.applicable === 0;
	if (aEmpty !== bEmpty) return aEmpty ? 1 : -1;
	const byReadiness = aEmpty ? 0 : a.today.ready * b.today.applicable - b.today.ready * a.today.applicable;
	return byReadiness || a.label.localeCompare(b.label) || compareText(a.key ?? '', b.key ?? '');
}

function buildGrid(analysis: Analysis): BriefingGrid {
	const { input, columns, rows, entries } = analysis;
	return {
		rowsBy: input.rowsBy,
		columns: columns.map((type) => ({ typeId: type.id, name: type.name })),
		rows: rows
			.map((row) => gridRow(row.key, row.label, row.soldierCount, row.entries, analysis))
			.sort(compareRowsByReadiness),
		total: gridRow(null, 'Total', analysis.population.length, entries, analysis),
		legend: legendFor(input.goalPercent),
		dropAlertPoints: DROP_ALERT_POINTS
	};
}

function buildTypeRisk(analysis: Analysis): BriefingTypeRisk[] {
	return analysis.columns
		.map((type, column) => {
			const typeEntries = analysis.entries.filter((entry) => entry.column === column);
			return {
				typeId: type.id,
				name: type.name,
				applicable: typeEntries.length,
				notReady: typeEntries.filter((entry) => !entry.requirement.readyToday).length,
				lapsing: typeEntries.filter((entry) => entry.requirement.lapsesInHorizon).length
			};
		})
		.sort((a, b) => b.notReady + b.lapsing - (a.notReady + a.lapsing));
}

function mostCommon(values: string[]): { value: string; count: number } {
	const counts = new Map<string, number>();
	for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
	let best = { value: '', count: 0 };
	for (const [value, count] of [...counts].sort(([a], [b]) => compareText(a, b))) {
		if (count > best.count) best = { value, count };
	}
	return best;
}

function concentratedRows(analysis: Analysis, entries: Entry[]): string[] {
	const counts = new Map<string, number>();
	for (const entry of entries) {
		const key = entry.requirement.rowKey;
		counts.set(key, (counts.get(key) ?? 0) + 1);
	}
	const ranked = analysis.rows
		.map((row) => ({ row, count: counts.get(row.key) ?? 0 }))
		.sort((a, b) => b.count - a.count || a.row.label.localeCompare(b.row.label) || compareText(a.row.key, b.row.key));
	const [first, second] = ranked;
	if (first.count * 2 > entries.length) return [first.row.label];
	if (second && (first.count + second.count) * 2 > entries.length) return [first.row.label, second.row.label];
	return [];
}

function focusBase(key: FocusCandidateKey, entries: Entry[]) {
	const soldierCount = distinctPeople(entries);
	return { key, requirementCount: entries.length, soldierCount, linkLabel: `View ${soldiers(soldierCount)}` };
}

function waveCandidate(analysis: Analysis, baseline: number): Candidate | null {
	const { cliff, columns, entries: allEntries } = analysis;
	if (!cliff?.highlighted || cliff.dominantColumns.length === 0) return null;
	const dominant = cliff.dominantColumns;
	const entries = cliff.entries.filter((entry) => dominant.includes(entry.column));
	const lapseDates = entries.flatMap((entry) => (entry.requirement.lapseDate ? [entry.requirement.lapseDate] : []));
	const firstLapseDate = [...lapseDates].sort(compareText)[0];
	const waveMonth = mostCommon(lapseDates.map((date) => date.slice(0, 7)));
	const types = joinNames(dominant.map((column) => columns[column].name));
	const range = cliffRange(analysis, cliff);
	const horizonEndLabel = dayLabel(analysis.horizonEnd);

	const sentences = [
		`${entries.length} of the ${cliff.entries.length} records lapsing ${range.start}–${range.end} are ${types}.`
	];
	const completions = entries.flatMap((entry) =>
		entry.requirement.completionDate ? [entry.requirement.completionDate] : []
	);
	const sharedCompletion = mostCommon(completions);
	if (sharedCompletion.count * 2 >= entries.length) {
		sentences.push(`Most were completed on ${fullDateLabel(sharedCompletion.value)}, so they lapse together.`);
	}
	const hardestHit = analysis.rows
		.map((row) => {
			const rowEntries = row.entries.filter((entry) => dominant.includes(entry.column));
			const lapses = rowEntries.filter((entry) => entry.requirement.lapsesInHorizon).length;
			return { row, lapses, applicable: rowEntries.length };
		})
		.filter((candidate) => candidate.lapses > 0)
		.sort(
			(a, b) =>
				b.lapses * a.applicable - a.lapses * b.applicable ||
				b.lapses - a.lapses ||
				a.row.label.localeCompare(b.row.label) ||
				compareText(a.row.key, b.row.key)
		)[0];
	sentences.push(`${hardestHit.row.label} takes the biggest hit.`);

	const before = percent(baseline, allEntries.length);
	const after = percent(baseline + entries.length, allEntries.length);
	const monthIndex = Number(waveMonth.value.slice(5, 7)) - 1;
	return {
		order: 0,
		name: types,
		entries,
		area: {
			kind: 'wave',
			...focusBase('wave', entries),
			title: `${types} — the ${LONG_MONTHS[monthIndex]} wave`,
			body: sentences.join(' '),
			whatIf: {
				chip: `RENEWED BEFORE ${dayLabel(firstLapseDate)} · ${horizonEndLabel} forecast ${before}% → ${after}%`,
				before,
				after
			},
			typeIds: dominant.map((column) => columns[column].id),
			firstLapseDate,
			firstLapseLabel: `First lapse ${dayLabel(firstLapseDate)}`
		}
	};
}

function gapCandidates(analysis: Analysis, baseline: number): Candidate[] {
	const { columns, entries: allEntries, population, input } = analysis;
	const horizonEndLabel = dayLabel(analysis.horizonEnd);
	return columns.flatMap((type, column) => {
		const typeEntries = allEntries.filter((entry) => entry.column === column);
		const notReady = typeEntries.filter((entry) => !entry.requirement.readyToday);
		if (notReady.length === 0 || notReady.length * 5 < typeEntries.length) return [];
		const entries = typeEntries.filter(isAffected);
		const notReadySoldiers = distinctPeople(notReady);
		const sentences = [
			`${soldiers(notReadySoldiers)} ${notReadySoldiers === 1 ? 'is' : 'are'} already not ready, ${percent(notReadySoldiers, population.length)}% of ${input.scopeName}.`
		];
		const holders = concentratedRows(analysis, notReady);
		if (holders.length > 0) {
			sentences.push(`${joinNames(holders)} ${holders.length === 1 ? 'holds' : 'hold'} more than half of them.`);
		}
		const before = percent(baseline, allEntries.length);
		const after = percent(baseline + entries.length, allEntries.length);
		const key: FocusCandidateKey = `gap:${type.id}`;
		return [
			{
				order: 1,
				name: type.name,
				entries,
				area: {
					kind: 'gap',
					...focusBase(key, entries),
					title: `${type.name} — the standing gap`,
					body: sentences.join(' '),
					whatIf: { chip: `ALL RENEWED · ${horizonEndLabel} forecast ${before}% → ${after}%`, before, after },
					typeId: type.id
				}
			}
		];
	});
}

function rowCandidates(analysis: Analysis): Candidate[] {
	const { columns, rows, input } = analysis;
	const horizonEndLabel = dayLabel(analysis.horizonEnd);
	return rows.flatMap((row) => {
		const summary = summarize(row.entries, input.horizonDays, input.goalPercent);
		if (!summary.dropAlert) return [];
		const lapsing = row.entries.filter((entry) => entry.requirement.lapsesInHorizon);
		const topColumns = rankColumnsByCount(lapsing)
			.slice(0, 2)
			.map((ranked) => ranked.column);
		const entries = lapsing.filter((entry) => topColumns.includes(entry.column));
		const types = joinNames(topColumns.map((column) => columns[column].name));
		const sentences = [
			`${row.label} falls from ${summary.today.percent}% to ${summary.horizon.percent}% by ${horizonEndLabel}.`
		];
		if (topColumns.length === 2) {
			const peopleByColumn = topColumns.map(
				(column) => new Set(entries.filter((entry) => entry.column === column).map((entry) => entry.person.id))
			);
			const dueForBoth = [...peopleByColumn[0]].filter((personId) => peopleByColumn[1].has(personId)).length;
			if (dueForBoth > 0) sentences.push(`${soldiers(dueForBoth)} ${dueForBoth === 1 ? 'is' : 'are'} due for both.`);
		}
		const before = summary.horizon.percent;
		const after = percent(summary.horizon.ready + entries.length, row.entries.length);
		const key: FocusCandidateKey = `row:${input.rowsBy}:${row.key}`;
		return [
			{
				order: 2,
				name: row.label,
				entries,
				area: {
					kind: 'row',
					...focusBase(key, entries),
					title: `${row.label} — ${types}`,
					body: sentences.join(' '),
					whatIf: {
						chip: `ALL RENEWED · ${row.label} ${horizonEndLabel} forecast ${before}% → ${after}%`,
						before,
						after
					},
					rowKey: row.key,
					typeIds: topColumns.map((column) => columns[column].id)
				}
			}
		];
	});
}

function selectFocus(analysis: Analysis): Candidate[] {
	const baseline = countReadyAt(analysis.entries, analysis.input.horizonDays);
	const wave = waveCandidate(analysis, baseline);
	const candidates = [...(wave ? [wave] : []), ...gapCandidates(analysis, baseline), ...rowCandidates(analysis)].sort(
		(a, b) =>
			b.entries.length - a.entries.length ||
			a.order - b.order ||
			a.name.localeCompare(b.name) ||
			compareText(a.area.key, b.area.key)
	);
	const covered = new Set<Entry>();
	const selected: Candidate[] = [];
	for (const candidate of candidates) {
		if (selected.length === MAX_FOCUS_AREAS) break;
		if (candidate.entries.length * 100 < analysis.entries.length) continue;
		const overlap = candidate.entries.filter((entry) => covered.has(entry)).length;
		if (overlap * 2 >= candidate.entries.length) continue;
		selected.push(candidate);
		for (const entry of candidate.entries) covered.add(entry);
	}
	return selected;
}

function buildFocus(analysis: Analysis): BriefingFocus {
	const areas = selectFocus(analysis).map((candidate) => candidate.area);
	return {
		areas,
		emptyMessage: areas.length === 0 ? `Nothing drops more than 1 point by ${dayLabel(analysis.horizonEnd)}.` : null
	};
}

function bottomLineSentence(analysis: Analysis, drop: number | null): string {
	const { input, cliff, horizonEnd } = analysis;
	const lapsing = analysis.bucketLapses.reduce((total, lapses) => total + lapses, 0);
	if (lapsing === 0) return `Nothing lapses before ${dayLabel(horizonEnd)}.`;
	const sentence = `If no one renews, ${input.scopeName} loses ${drop} points in ${input.horizonDays} days.`;
	if (!cliff?.highlighted) return sentence;
	const range = cliffRange(analysis, cliff);
	const share =
		cliff.entries.length * 2 > lapsing ? 'More than half' : `${Math.round((cliff.entries.length * 100) / lapsing)}%`;
	return `${sentence} ${share} of that drop lands between ${range.start} and ${range.end}.`;
}

function readinessSummary(input: TrainingReadinessInput, entries: Entry[]): TrainingReadinessSummary {
	const totals = summarize(entries, input.horizonDays, input.goalPercent);
	const horizonEnd = addDays(input.asOf, input.horizonDays);
	return {
		asOf: input.asOf,
		horizonEnd,
		horizonEndLabel: dayLabel(horizonEnd),
		goalPercent: input.goalPercent,
		today: totals.today,
		horizon: totals.horizon,
		expired: entries.filter((entry) => entry.requirement.status === 'expired').length,
		notRecorded: entries.filter((entry) => entry.requirement.status === 'not-completed').length,
		lapsing: entries.filter((entry) => entry.requirement.lapsesInHorizon).length
	};
}

export function summarizeTrainingReadiness(input: TrainingReadinessInput): TrainingReadinessSummary {
	const types = input.types.filter((type) => !type.isOptional);
	return readinessSummary(input, requirementEntries({ ...input, types }));
}

/** The requirements the readiness numbers count, one per Person and Training type that applies and is not exempt. */
export function trainingRequirements(input: Omit<TrainingReadinessInput, 'goalPercent'>): BriefingRequirement[] {
	return requirementEntries({ ...input, goalPercent: 0 }).map((entry) => entry.requirement);
}

export function trainingMatrixGaps(input: TrainingReadinessInput): TrainingMatrixGaps {
	const entries = requirementEntries(input);
	const byType: Record<string, TrainingColumnGaps> = Object.fromEntries(
		input.types.map((type) => [type.id, { notReady: 0, lapsing: 0 }])
	);
	for (const { requirement } of entries) {
		if (!requirement.readyToday) byType[requirement.typeId].notReady += 1;
		if (requirement.lapsesInHorizon) byType[requirement.typeId].lapsing += 1;
	}
	const requiredTypeIds = new Set(input.types.filter((type) => !type.isOptional).map((type) => type.id));
	const requiredEntries = entries.filter((entry) => requiredTypeIds.has(entry.requirement.typeId));
	return {
		readiness: summarize(requiredEntries, input.horizonDays, input.goalPercent).today,
		byType
	};
}

export function buildTrainingBriefing(input: TrainingBriefingInput): TrainingBriefing {
	const analysis = analyze(input);
	const summary = readinessSummary(input, analysis.entries);
	const drop = percent(summary.today.ready - summary.horizon.ready, summary.today.applicable);
	return {
		bottomLine: {
			scopeName: input.scopeName,
			soldierCount: analysis.population.length,
			asOf: summary.asOf,
			asOfLabel: fullDateLabel(input.asOf),
			horizonEnd: summary.horizonEnd,
			horizonEndLabel: summary.horizonEndLabel,
			today: summary.today,
			horizon: summary.horizon,
			drop,
			expired: summary.expired,
			notRecorded: summary.notRecorded,
			lapsing: summary.lapsing,
			sentence: bottomLineSentence(analysis, drop)
		},
		forecast: buildForecast(analysis),
		grid: buildGrid(analysis),
		typeRisk: buildTypeRisk(analysis),
		focus: buildFocus(analysis)
	};
}

function compareAffected(a: Entry, b: Entry): number {
	const aMissing = a.requirement.status === 'not-completed';
	const bMissing = b.requirement.status === 'not-completed';
	if (aMissing !== bMissing) return aMissing ? -1 : 1;
	const aExpiration = a.requirement.expirationDate;
	const bExpiration = b.requirement.expirationDate;
	if (aExpiration !== bExpiration) {
		if (aExpiration === null) return 1;
		if (bExpiration === null) return -1;
		return compareText(aExpiration, bExpiration);
	}
	return (
		`${a.person.lastName}, ${a.person.firstName}`.localeCompare(`${b.person.lastName}, ${b.person.firstName}`) ||
		compareText(a.person.id, b.person.id) ||
		a.column - b.column
	);
}

/** Every requirement the filtered briefing marks not ready today or lapsing in the horizon, in drill-down order. */
export function affectedBriefingRequirements(input: TrainingBriefingInput): BriefingRequirement[] {
	return analyze(input)
		.entries.filter(isAffected)
		.sort(compareAffected)
		.map((entry) => entry.requirement);
}

/**
 * The requirements behind a grid cell (not ready today or lapsing in the horizon) or a selected focus area.
 * Returns null when the scope names a row, type or focus area the same input does not produce.
 */
export function matchBriefingRequirements(
	input: TrainingBriefingInput,
	scope: BriefingScope
): BriefingRequirement[] | null {
	const analysis = analyze(input);
	let matched: Entry[];
	if (scope.kind === 'cell') {
		const column = analysis.columns.findIndex((type) => type.id === scope.typeId);
		const pool =
			scope.rowKey === null ? analysis.entries : analysis.rows.find((row) => row.key === scope.rowKey)?.entries;
		if (column === -1 || !pool) return null;
		matched = pool.filter((entry) => entry.column === column && isAffected(entry));
	} else {
		const candidate = selectFocus(analysis).find((selected) => selected.area.key === scope.key);
		if (!candidate) return null;
		matched = candidate.entries;
	}
	return [...matched].sort(compareAffected).map((entry) => entry.requirement);
}
