import * as XLSX from 'xlsx';
import type { Personnel } from '$lib/types';
import type { RatingSchemeEntry } from '../counseling.types';
import { WORKFLOW_STATUS_OPTIONS } from '../counseling.types';
import { getRatingDueStatus, getDaysUntilDue, getReportTypeLabel } from './ratingScheme';

function getPersonName(personnel: Personnel[], id: string | null, name: string | null): string {
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

export function exportRatingScheme(entries: RatingSchemeEntry[], personnel: Personnel[]) {
	const rows = entries.map((entry) => {
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
	});

	const ws = XLSX.utils.json_to_sheet(rows);

	// Set column widths
	ws['!cols'] = [
		{ wch: 10 }, // Eval Type
		{ wch: 18 }, // Report Type
		{ wch: 28 }, // Rated Individual
		{ wch: 8 }, // Rank
		{ wch: 28 }, // Rater
		{ wch: 28 }, // Senior Rater
		{ wch: 28 }, // Intermediate Rater
		{ wch: 28 }, // Reviewer
		{ wch: 14 }, // Rating Period Start
		{ wch: 14 }, // Thru Date
		{ wch: 14 }, // Days Until Due
		{ wch: 16 }, // Due Status
		{ wch: 16 }, // Status
		{ wch: 22 }, // Workflow Status
		{ wch: 30 } // Notes
	];

	const wb = XLSX.utils.book_new();
	XLSX.utils.book_append_sheet(wb, ws, 'Rating Scheme');

	const today = new Date().toISOString().slice(0, 10);
	XLSX.writeFile(wb, `rating-scheme-${today}.xlsx`);
}
