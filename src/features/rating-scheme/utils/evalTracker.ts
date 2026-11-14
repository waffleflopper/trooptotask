import type { PersonnelLookup } from '$features/personnel/contracts';
import { formatDate, parseDate } from '$lib/utils/dates';
import type {
	Evaluation,
	EvaluatorChain,
	RatingDueStatus,
	RatingScheme,
	RatingSchemeEntry,
	ReportType
} from '../rating-scheme.types';
import { isEvaluationCompleted, type WaitingRole } from './evaluationWorkflow';
import { spokenPersonLabel } from './personLabel';
import { calculateThruDate, getRatingDueStatus } from './ratingScheme';
import { isOnTracker } from './ratingSchemeEntries';

/** Open lists every Evaluation still in work, Not tracked ones included; Completed lists the signed history. */
export type TrackerStatusFilter = 'open' | 'completed' | 'all';

export function isTrackerListed(entry: RatingSchemeEntry, filter: TrackerStatusFilter): boolean {
	const completed = isEvaluationCompleted(entry.workflowStatus);
	if (filter === 'completed') return completed;
	const open = !completed && isOnTracker(entry);
	return filter === 'open' ? open : open || completed;
}

const DUE_RANK: Record<RatingDueStatus, number> = { overdue: 0, 'due-30': 1, 'due-60': 2, current: 3, completed: 4 };

/** Past thru first, then the nearest thru. Completed Evaluations follow, the latest period first. */
export function byUrgency<T extends Pick<RatingSchemeEntry, 'ratingPeriodEnd' | 'workflowStatus'>>(
	entries: readonly T[],
	today: Date = new Date()
): T[] {
	const rank = new Map(
		entries.map((entry) => [entry, DUE_RANK[getRatingDueStatus(entry.ratingPeriodEnd, entry.workflowStatus, today)]])
	);
	return [...entries].sort((a, b) => {
		const byRank = rank.get(a)! - rank.get(b)!;
		if (byRank) return byRank;
		const byEnd = a.ratingPeriodEnd.localeCompare(b.ratingPeriodEnd);
		return isEvaluationCompleted(a.workflowStatus) ? -byEnd : byEnd;
	});
}

/** The period a scheme's next Evaluation covers: from the day after the last thru, an Annual's twelve months. */
export interface NextPeriod {
	reportType: ReportType;
	ratingPeriodStart: string;
	ratingPeriodEnd: string;
}

/** A listed scheme with nothing in work on it, so its next Evaluation can start. */
export interface ReadyToStart {
	scheme: RatingScheme;
	/** Its latest Evaluation by thru, which is completed; null when it has none. */
	last: Evaluation | null;
	next: NextPeriod | null;
}

export function nextPeriod(last: Pick<Evaluation, 'ratingPeriodEnd'> | null): NextPeriod | null {
	if (!last) return null;
	const day = parseDate(last.ratingPeriodEnd);
	day.setDate(day.getDate() + 1);
	const ratingPeriodStart = formatDate(day);
	return { reportType: 'AN', ratingPeriodStart, ratingPeriodEnd: calculateThruDate('AN', ratingPeriodStart)! };
}

/**
 * Listed schemes whose Evaluations are all completed. A Not tracked Evaluation keeps its scheme off the list, because
 * its own row on the tracker starts tracking it.
 */
export function readyToStart(schemes: readonly RatingScheme[], evaluations: readonly Evaluation[]): ReadyToStart[] {
	const bySchemeId = new Map<string, Evaluation[]>();
	for (const evaluation of evaluations) {
		const own = bySchemeId.get(evaluation.ratingSchemeId);
		if (own) own.push(evaluation);
		else bySchemeId.set(evaluation.ratingSchemeId, [evaluation]);
	}
	return schemes.flatMap((scheme) => {
		if (scheme.archivedAt !== null) return [];
		const own = bySchemeId.get(scheme.id) ?? [];
		if (own.some((evaluation) => !isEvaluationCompleted(evaluation.workflowStatus))) return [];
		const last = own.reduce<Evaluation | null>(
			(latest, evaluation) => (!latest || latest.ratingPeriodEnd < evaluation.ratingPeriodEnd ? evaluation : latest),
			null
		);
		return [{ scheme, last, next: nextPeriod(last) }];
	});
}

/** Every Evaluation of one rated Person, the latest period first. */
export function personEvaluations(evaluations: readonly Evaluation[], ratedPersonId: string): Evaluation[] {
	return evaluations
		.filter((evaluation) => evaluation.ratedPersonId === ratedPersonId)
		.sort((a, b) => b.ratingPeriodEnd.localeCompare(a.ratingPeriodEnd) || b.id.localeCompare(a.id));
}

export const WAITING_ROLE_CODE: Record<WaitingRole, string> = {
	rater: 'RTR',
	intermediateRater: 'IR',
	seniorRater: 'SR',
	reviewer: 'REV',
	rated: 'SM',
	command: 'CMD',
	hrc: 'HRC'
};

/** The person or office a role names on this chain, or null when the role is Not Set or its Person is gone. */
export function waitingOnName(
	role: WaitingRole,
	chain: EvaluatorChain & { ratedPersonId: string },
	personnel: readonly PersonnelLookup[]
): string | null {
	const named = (personId: string | null, name: string | null = null) => {
		if (!personId) return name?.trim() || null;
		const person = personnel.find((candidate) => candidate.id === personId);
		return person ? spokenPersonLabel(person) : null;
	};
	switch (role) {
		case 'rater':
			return named(chain.raterPersonId, chain.raterName);
		case 'intermediateRater':
			return named(chain.intermediateRaterPersonId, chain.intermediateRaterName);
		case 'seniorRater':
			return named(chain.seniorRaterPersonId, chain.seniorRaterName);
		case 'reviewer':
			return named(chain.reviewerPersonId, chain.reviewerName);
		case 'rated':
			return named(chain.ratedPersonId);
		case 'command':
			return 'Command review';
		case 'hrc':
			return 'HRC';
	}
}
