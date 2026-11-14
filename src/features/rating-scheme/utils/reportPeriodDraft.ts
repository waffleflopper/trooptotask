import type { ReportType } from '../rating-scheme.types';
import { calculateThruDate } from './ratingScheme';

/** The report and period an Evaluation covers, as its sheet edits them. An empty report type is Not set. */
export interface ReportPeriodDraft {
	reportType: ReportType | '';
	ratingPeriodStart: string;
	ratingPeriodEnd: string;
}

/** An Annual covers twelve months, so choosing one or moving its Start fills Thru in. */
function withAnnualThru(draft: ReportPeriodDraft): ReportPeriodDraft {
	const thru = calculateThruDate(draft.reportType || null, draft.ratingPeriodStart);
	return thru ? { ...draft, ratingPeriodEnd: thru } : draft;
}

export function withReportType(draft: ReportPeriodDraft, reportType: ReportType | ''): ReportPeriodDraft {
	return withAnnualThru({ ...draft, reportType });
}

export function withPeriodStart(draft: ReportPeriodDraft, ratingPeriodStart: string): ReportPeriodDraft {
	return withAnnualThru({ ...draft, ratingPeriodStart });
}

export function reportPeriodProblem(draft: ReportPeriodDraft): string | null {
	if (!draft.ratingPeriodStart) return 'Choose the start of the rating period.';
	if (!draft.ratingPeriodEnd) return 'Choose the thru date.';
	if (draft.ratingPeriodEnd < draft.ratingPeriodStart) return 'The thru date must be on or after the start.';
	return null;
}
