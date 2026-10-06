import type { TrainingBriefingDetailRow, TrainingBriefingReportData } from '../contracts';
import { addTableSheet, createWorkbook, type Workbook, type WorkbookRow } from '$lib/utils/workbook';
import { BRIEFING_ROWS_BY_LABELS, briefingFilterLabels } from './briefingFilterLabels';

export interface TrainingReportWorkbookInput {
	report: TrainingBriefingReportData;
	/** Every affected requirement of the filtered briefing, unpaginated, in drill-down order. */
	requirements: TrainingBriefingDetailRow[];
}

function yesNo(value: boolean): string {
	return value ? 'Yes' : 'No';
}

function summaryRows({ report }: TrainingReportWorkbookInput): WorkbookRow[] {
	const { bottomLine, forecast } = report.briefing;
	return [
		{ item: 'Organization', value: report.organizationName },
		{ item: 'Scope', value: bottomLine.scopeName },
		{ item: 'Soldiers', value: bottomLine.soldierCount },
		{ item: 'As of', value: bottomLine.asOf },
		{ item: 'Horizon end', value: bottomLine.horizonEnd },
		{ item: 'Readiness goal (%)', value: forecast.goalPercent },
		{ item: 'Ready today (%)', value: bottomLine.today.percent },
		{ item: `Ready by ${bottomLine.horizonEndLabel} (%)`, value: bottomLine.horizon.percent },
		{ item: 'Drop (points)', value: bottomLine.drop },
		{ item: 'Ready', value: bottomLine.today.ready },
		{ item: 'Applicable requirements', value: bottomLine.today.applicable },
		{ item: 'Not ready, expired', value: bottomLine.expired },
		{ item: 'Not ready, not recorded', value: bottomLine.notRecorded },
		{ item: `Lapse by ${bottomLine.horizonEndLabel}`, value: bottomLine.lapsing },
		{ item: 'Bottom line', value: bottomLine.sentence },
		...briefingFilterLabels(report.input, report.filterOptions).map(({ label, value }) => ({
			item: `Filter: ${label}`,
			value
		}))
	];
}

function forecastRows({ report }: TrainingReportWorkbookInput): WorkbookRow[] {
	const { points, buckets } = report.briefing.forecast;
	return points.map((point, index) => {
		const bucket = index === 0 ? null : buckets[index - 1];
		return {
			date: point.date,
			ready: point.ready,
			percent: point.percent,
			week: bucket?.label,
			lapses: bucket?.lapses,
			cliff: bucket ? yesNo(bucket.inCliff) : undefined
		};
	});
}

function hotSpotSheet(workbook: Workbook, { report }: TrainingReportWorkbookInput): void {
	const { grid, bottomLine } = report.briefing;
	addTableSheet(workbook, {
		name: 'Hot spots',
		columns: [
			{ header: BRIEFING_ROWS_BY_LABELS[grid.rowsBy], key: 'row', width: 24 },
			{ header: 'Soldiers', key: 'soldiers', width: 10 },
			...grid.columns.flatMap((column, index) => [
				{ header: `${column.name} today (%)`, key: `today${index}`, width: 16 },
				{ header: `${column.name} drop`, key: `drop${index}`, width: 14 }
			]),
			{ header: 'Today (%)', key: 'today', width: 12 },
			{ header: `${bottomLine.horizonEndLabel} (%)`, key: 'horizon', width: 12 },
			{ header: 'Drop', key: 'drop', width: 10 }
		],
		rows: [...grid.rows, grid.total].map((row) => ({
			row: row.label,
			soldiers: row.soldierCount,
			...Object.fromEntries(
				row.cells.flatMap((cell, index) => [
					[`today${index}`, cell.today.percent],
					[`drop${index}`, cell.drop]
				])
			),
			today: row.today.percent,
			horizon: row.horizon.percent,
			drop: row.drop
		}))
	});
}

function focusRows({ report }: TrainingReportWorkbookInput): WorkbookRow[] {
	const { areas, emptyMessage } = report.briefing.focus;
	if (areas.length === 0) return [{ body: emptyMessage }];
	return areas.map((area, index) => ({
		rank: index + 1,
		title: area.title,
		body: area.body,
		whatIf: area.whatIf.chip,
		before: area.whatIf.before,
		after: area.whatIf.after,
		soldiers: area.soldierCount,
		requirements: area.requirementCount,
		firstLapse: area.kind === 'wave' ? area.firstLapseDate : undefined
	}));
}

/** The displayed briefing as five native sheets; every label stays a text cell. */
export async function buildTrainingReportWorkbook(input: TrainingReportWorkbookInput): Promise<Workbook> {
	const workbook = await createWorkbook();
	addTableSheet(workbook, {
		name: 'Summary',
		columns: [
			{ header: 'Item', key: 'item', width: 28 },
			{ header: 'Value', key: 'value', width: 60 }
		],
		rows: summaryRows(input)
	});
	addTableSheet(workbook, {
		name: 'Forecast',
		columns: [
			{ header: 'Date', key: 'date', width: 12 },
			{ header: 'Ready', key: 'ready', width: 10 },
			{ header: 'Ready (%)', key: 'percent', width: 10 },
			{ header: 'Week', key: 'week', width: 18 },
			{ header: 'Lapses', key: 'lapses', width: 10 },
			{ header: 'Cliff window', key: 'cliff', width: 12 }
		],
		rows: forecastRows(input)
	});
	hotSpotSheet(workbook, input);
	addTableSheet(workbook, {
		name: 'Focus',
		columns: [
			{ header: '#', key: 'rank', width: 5 },
			{ header: 'Title', key: 'title', width: 36 },
			{ header: 'Body', key: 'body', width: 80 },
			{ header: 'What if', key: 'whatIf', width: 56 },
			{ header: 'Forecast before (%)', key: 'before', width: 18 },
			{ header: 'Forecast after (%)', key: 'after', width: 18 },
			{ header: 'Soldiers', key: 'soldiers', width: 10 },
			{ header: 'Requirements', key: 'requirements', width: 14 },
			{ header: 'First lapse', key: 'firstLapse', width: 12 }
		],
		rows: focusRows(input)
	});
	addTableSheet(workbook, {
		name: 'Requirements',
		columns: [
			{ header: 'Rank', key: 'rank', width: 10 },
			{ header: 'Name', key: 'name', width: 24 },
			{ header: 'Group', key: 'group', width: 18 },
			{ header: 'Training type', key: 'type', width: 22 },
			{ header: 'Status today', key: 'status', width: 14 },
			{ header: 'Expiration date', key: 'expiration', width: 16 },
			{ header: 'Lapse date', key: 'lapse', width: 12 },
			{ header: 'Lapses in horizon', key: 'lapses', width: 16 }
		],
		rows: input.requirements.map((row) => ({
			rank: row.rank,
			name: row.name,
			group: row.groupName,
			type: row.typeName,
			status: row.label,
			expiration: row.expirationDate,
			lapse: row.lapseDate,
			lapses: yesNo(row.lapsesInHorizon)
		}))
	});
	return workbook;
}
