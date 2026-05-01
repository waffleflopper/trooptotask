import type { PersonnelLookup } from '$lib/types';
import type { RatingSchemeEntry } from '../rating-scheme.types';
import { WORKFLOW_STATUS_OPTIONS } from '../rating-scheme.types';
import { getRatingDueStatus, getDaysUntilDue, getReportTypeLabel } from './ratingScheme';

const RATING_SCHEME_COLUMNS = [
	{ header: 'Eval Type', key: 'Eval Type', width: 10 },
	{ header: 'Report Type', key: 'Report Type', width: 18 },
	{ header: 'Rated Individual', key: 'Rated Individual', width: 28 },
	{ header: 'Rank', key: 'Rank', width: 8 },
	{ header: 'Rater', key: 'Rater', width: 28 },
	{ header: 'Senior Rater', key: 'Senior Rater', width: 28 },
	{ header: 'Intermediate Rater', key: 'Intermediate Rater', width: 28 },
	{ header: 'Reviewer', key: 'Reviewer', width: 28 },
	{ header: 'Rating Period Start', key: 'Rating Period Start', width: 14 },
	{ header: 'Thru Date', key: 'Thru Date', width: 14 },
	{ header: 'Days Until Due', key: 'Days Until Due', width: 14 },
	{ header: 'Due Status', key: 'Due Status', width: 16 },
	{ header: 'Status', key: 'Status', width: 16 },
	{ header: 'Workflow Status', key: 'Workflow Status', width: 22 },
	{ header: 'Notes', key: 'Notes', width: 30 }
];

function getPersonName(personnel: PersonnelLookup[], id: string | null, name: string | null): string {
	if (id) {
		const p = personnel.find((p) => p.id === id);
		return p ? `${p.rank} ${p.lastName}, ${p.firstName}` : 'Unknown';
	}
	return name ?? '';
}

function getDueStatusLabel(entry: RatingSchemeEntry): string {
	const status = getRatingDueStatus(entry.ratingPeriodEnd, entry.status);
	const days = getDaysUntilDue(entry.ratingPeriodEnd);
	if (status === 'completed') return 'Completed';
	if (status === 'overdue') return `Overdue (${Math.abs(days)}d)`;
	if (status === 'due-30') return `Due in ${days}d`;
	if (status === 'due-60') return `Due in ${days}d`;
	return 'Current';
}

function getWorkflowLabel(status: string | null): string {
	if (!status) return '';
	return WORKFLOW_STATUS_OPTIONS.find((o) => o.value === status)?.label ?? status;
}

function getStatusLabel(status: string): string {
	if (status === 'active') return 'Active';
	if (status === 'completed') return 'Completed';
	if (status === 'change-of-rater') return 'Change of Rater';
	return status;
}

export async function exportRatingScheme(entries: RatingSchemeEntry[], personnel: PersonnelLookup[]) {
	const ExcelJS = await import('exceljs');
	const rows = entries.map((entry) => buildRatingSchemeExportRow(entry, personnel));

	const workbook = new ExcelJS.Workbook();
	const sheet = workbook.addWorksheet('Rating Scheme');
	sheet.columns = RATING_SCHEME_COLUMNS;
	sheet.addRows(rows);
	sheet.getRow(1).font = { bold: true };

	const today = new Date().toISOString().slice(0, 10);
	const buffer = await workbook.xlsx.writeBuffer();
	downloadBlob(
		new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
		`rating-scheme-${today}.xlsx`
	);
}

function buildRatingSchemeExportRow(entry: RatingSchemeEntry, personnel: PersonnelLookup[]) {
	const rated = personnel.find((p) => p.id === entry.ratedPersonId);
	return {
		'Eval Type': entry.evalType,
		'Report Type': entry.reportType ? getReportTypeLabel(entry.reportType, entry.evalType) : '',
		'Rated Individual': rated ? `${rated.rank} ${rated.lastName}, ${rated.firstName}` : 'Unknown',
		Rank: rated?.rank ?? '',
		Rater: getPersonName(personnel, entry.raterPersonId, entry.raterName),
		'Senior Rater': getPersonName(personnel, entry.seniorRaterPersonId, entry.seniorRaterName),
		'Intermediate Rater': getPersonName(personnel, entry.intermediateRaterPersonId, entry.intermediateRaterName),
		Reviewer: getPersonName(personnel, entry.reviewerPersonId, entry.reviewerName),
		'Rating Period Start': entry.ratingPeriodStart,
		'Thru Date': entry.ratingPeriodEnd,
		'Days Until Due': getDaysUntilDue(entry.ratingPeriodEnd),
		'Due Status': getDueStatusLabel(entry),
		Status: getStatusLabel(entry.status),
		'Workflow Status': getWorkflowLabel(entry.workflowStatus),
		Notes: entry.notes ?? ''
	};
}

function downloadBlob(blob: Blob, filename: string) {
	const url = URL.createObjectURL(blob);
	const link = document.createElement('a');
	link.href = url;
	link.download = filename;
	document.body.appendChild(link);
	link.click();
	document.body.removeChild(link);
	URL.revokeObjectURL(url);
}
