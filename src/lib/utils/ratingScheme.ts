import { ARMY_RANKS, OER_REPORT_TYPES, NCOER_REPORT_TYPES, WOER_REPORT_TYPES } from '../types';
import type { RatingDueStatus, ReportType, ReportTypeOption } from '../types';

export function getEvalTypeForRank(rank: string): 'OER' | 'NCOER' | 'WOER' {
	if ((ARMY_RANKS.officer as readonly string[]).includes(rank)) return 'OER';
	if ((ARMY_RANKS.warrant as readonly string[]).includes(rank)) return 'WOER';
	return 'NCOER';
}

export function getRatingDueStatus(
	ratingPeriodEnd: string,
	status: string,
	today: Date = new Date()
): RatingDueStatus {
	if (status === 'completed') return 'completed';

	const end = new Date(ratingPeriodEnd + 'T00:00:00');
	const diffMs = end.getTime() - today.getTime();
	const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

	if (diffDays < 0) return 'overdue';
	if (diffDays <= 30) return 'due-30';
	if (diffDays <= 60) return 'due-60';
	return 'current';
}

export function getDaysUntilDue(ratingPeriodEnd: string, today: Date = new Date()): number {
	const end = new Date(ratingPeriodEnd + 'T00:00:00');
	const diffMs = end.getTime() - today.getTime();
	return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

export function getReportTypesForEvalType(evalType: 'OER' | 'NCOER' | 'WOER'): ReportTypeOption[] {
	if (evalType === 'OER') return OER_REPORT_TYPES;
	if (evalType === 'WOER') return WOER_REPORT_TYPES;
	return NCOER_REPORT_TYPES;
}

export function getReportTypeLabel(reportType: ReportType | null, evalType: 'OER' | 'NCOER' | 'WOER'): string {
	if (!reportType) return '';
	const options = getReportTypesForEvalType(evalType);
	return options.find((o) => o.value === reportType)?.label ?? reportType;
}

export function calculateThruDate(reportType: ReportType | null, startDate: string): string | null {
	if (reportType !== 'AN' || !startDate) return null;
	const start = new Date(startDate + 'T00:00:00');
	start.setMonth(start.getMonth() + 12);
	start.setDate(start.getDate() - 1);
	const yyyy = start.getFullYear();
	const mm = String(start.getMonth() + 1).padStart(2, '0');
	const dd = String(start.getDate()).padStart(2, '0');
	return `${yyyy}-${mm}-${dd}`;
}

export function getExtendedAnnualWarning(
	reportType: ReportType | null,
	evalType: 'OER' | 'NCOER' | 'WOER',
	startDate: string,
	endDate: string
): string | null {
	if (reportType !== 'EA' || !startDate || !endDate) return null;
	const start = new Date(startDate + 'T00:00:00');
	const end = new Date(endDate + 'T00:00:00');
	const diffMs = end.getTime() - start.getTime();
	const diffMonths = diffMs / (1000 * 60 * 60 * 24 * 30.44);
	const maxMonths = evalType === 'NCOER' ? 15 : 16;
	if (diffMonths > maxMonths) {
		return `Extended Annual period exceeds ${maxMonths} months for ${evalType}. Per AR 623-3, the maximum is ${maxMonths} months.`;
	}
	return null;
}
