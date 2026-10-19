import type { Personnel } from '$features/personnel/contracts';
import { parseDate } from '$lib/utils/dates';
import type { RatingSchemePersistence } from '../contracts';
import type { PersonnelActiveEvaluation } from '../rating-scheme.types';
import { evaluationPhase } from '../utils/evaluationPhase';
import { getDaysUntilDue, getRatingDueStatus, getReportTypeLabel } from '../utils/ratingScheme';

type Evaluator = 'rater' | 'seniorRater' | 'intermediateRater' | 'reviewer';
const EVALUATORS: readonly Evaluator[] = ['rater', 'seniorRater', 'intermediateRater', 'reviewer'];

/** Rating Scheme owns the active entry; delivery supplies the Person after Rating Scheme view admission and a readable-name lookup. */
export async function loadPersonnelActiveEvaluation(input: {
	ratingScheme: Pick<RatingSchemePersistence, 'listPersonReadiness'>;
	asOf: string;
	loadAuthorizedPerson: () => Promise<Personnel>;
	findPersonNames: (ids: string[]) => Promise<Map<string, string>>;
}): Promise<PersonnelActiveEvaluation | null> {
	const person = await input.loadAuthorizedPerson();
	const entry = (await input.ratingScheme.listPersonReadiness(person.id)).find((row) => row.status !== 'completed');
	if (!entry) return null;

	const personIds = EVALUATORS.map((role) => entry[`${role}PersonId`]).filter((id): id is string => Boolean(id));
	const names = personIds.length ? await input.findPersonNames(personIds) : new Map<string, string>();
	const nameFor = (role: Evaluator) => {
		const personId = entry[`${role}PersonId`];
		return (personId && names.get(personId)) || entry[`${role}Name`]?.trim() || (personId ? 'Unknown' : null);
	};
	const today = parseDate(input.asOf);

	return {
		entryId: entry.id,
		evalType: entry.evalType,
		reportType: entry.reportType,
		reportTypeLabel: entry.reportType ? getReportTypeLabel(entry.reportType, entry.evalType) : null,
		periodStart: entry.ratingPeriodStart,
		periodEnd: entry.ratingPeriodEnd,
		daysUntilThru: getDaysUntilDue(entry.ratingPeriodEnd, today),
		dueStatus: getRatingDueStatus(entry.ratingPeriodEnd, entry.status, today),
		workflowStatus: entry.workflowStatus,
		phase: evaluationPhase(entry.workflowStatus),
		rater: nameFor('rater'),
		seniorRater: nameFor('seniorRater'),
		intermediateRater: nameFor('intermediateRater'),
		reviewer: nameFor('reviewer')
	};
}
