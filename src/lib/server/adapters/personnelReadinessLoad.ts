import type { PersonnelCriticalTaskReadiness } from '$features/critical-tasks/contracts';
import { loadPersonnelCriticalTaskReadiness } from '$features/critical-tasks/index.server';
import type { PersonnelOnboardingSummary } from '$features/onboarding/contracts';
import { loadPersonnelOnboardingSummary } from '$features/onboarding/index.server';
import {
	buildPersonnelAttention,
	type Personnel,
	type PersonnelAttention,
	type PersonnelLossReadiness,
	type ReadinessSourceResult
} from '$features/personnel/contracts';
import { authorizePersonnelLane, loadPersonnelLossReadiness } from '$features/personnel/index.server';
import type { PersonnelActiveEvaluation } from '$features/rating-scheme/contracts';
import { loadPersonnelActiveEvaluation } from '$features/rating-scheme/index.server';
import type { PersonnelTrainingReadiness } from '$features/training/contracts';
import { loadPersonnelTrainingReadiness } from '$features/training/index.server';
import type { FeatureKey } from '$lib/access/featureSwitches';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { RequestFailure } from '$lib/errors';
import { isHttpError, type Cookies } from '@sveltejs/kit';
import { loadWithContext } from './httpAdapter';
import { createRequestPersonnelReadinessContext } from './requestContexts.server';
import { keepStreamedRejectionObserved } from './streamedWorkspace';

/** A source the unit turned off is null: nothing is read and the page leaves its block out. */
export interface PersonnelReadinessStreams {
	training: Promise<PersonnelTrainingReadiness> | null;
	criticalTasks: Promise<PersonnelCriticalTaskReadiness> | null;
	evaluation: Promise<PersonnelActiveEvaluation | null> | null;
	loss: Promise<PersonnelLossReadiness>;
	onboarding: Promise<PersonnelOnboardingSummary> | null;
	/** Settles every source, so it never rejects; a failed source reads as unchecked. */
	attention: Promise<PersonnelAttention>;
}

type ReadinessContext = ReturnType<typeof createRequestPersonnelReadinessContext>;

function settle<T>(source: Promise<T> | null, omitDenied: boolean): Promise<ReadinessSourceResult<T>> {
	if (!source) return Promise.resolve({ ok: false, off: true });
	return source.then(
		(value) => ({ ok: true, value }),
		(error: unknown) =>
			omitDenied && error instanceof RequestFailure && error.status === 403 ? { ok: false, off: true } : { ok: false }
	);
}

export interface PersonnelReadinessOptions {
	omitDenied?: boolean;
}

export function createPersonnelReadinessStreams(
	ctx: ReadinessContext,
	person: Personnel,
	asOf: string,
	{ omitDenied = false }: PersonnelReadinessOptions = {}
): PersonnelReadinessStreams {
	const on = (feature: FeatureKey) => !ctx.disabledFeatures.includes(feature);
	const lane = (action: Parameters<typeof authorizePersonnelLane>[2], resourceType: string) => () =>
		authorizePersonnelLane(ctx.detail, person, action, resourceType);
	const training = on('training')
		? loadPersonnelTrainingReadiness({
				trainingCatalog: ctx.trainingCatalog,
				trainingCompletions: ctx.trainingCompletions,
				asOf,
				loadAuthorizedPerson: lane(POLICY_ACTION_CATALOG.training.viewRecords, 'training_record')
			})
		: null;
	const criticalTasks = on('criticalTasks')
		? loadPersonnelCriticalTaskReadiness({
				organizationSettings: ctx.organizationSettings,
				criticalTaskLibrary: ctx.criticalTaskLibrary,
				criticalTaskCompletions: ctx.criticalTaskCompletions,
				orgId: ctx.detail.auth.orgId,
				asOf,
				loadAuthorizedPerson: lane(POLICY_ACTION_CATALOG.criticalTasks.viewReadiness, 'personnel_ict_completion')
			})
		: null;
	const evaluation = on('evaluations')
		? loadPersonnelActiveEvaluation({
				ratingScheme: ctx.ratingScheme,
				asOf,
				loadAuthorizedPerson: lane(POLICY_ACTION_CATALOG.ratingScheme.viewEntries, 'rating_scheme_entry'),
				findPersonNames: ctx.findPersonNames
			})
		: null;
	const loss = loadPersonnelLossReadiness(
		ctx.detail,
		person,
		asOf,
		on('lossesAndAwards') ? ctx.loadLossWarningWindowDays : null
	);
	const onboarding = on('onboarding')
		? loadPersonnelOnboardingSummary({
				onboardingWorkflow: ctx.onboardingWorkflow,
				loadAuthorizedPerson: lane(POLICY_ACTION_CATALOG.onboarding.viewWorkflows, 'personnel_onboarding')
			})
		: null;
	const attention = Promise.all([
		settle(training, omitDenied),
		settle(criticalTasks, omitDenied),
		settle(evaluation, omitDenied),
		settle(loss, omitDenied),
		settle(onboarding, omitDenied)
	]).then(([training, criticalTasks, evaluation, loss, onboarding]) =>
		buildPersonnelAttention({ training, criticalTasks, evaluation, loss, onboarding })
	);
	return { training, criticalTasks, evaluation, loss, onboarding, attention };
}

const readinessByRequest = new WeakMap<App.Locals, Map<string, Promise<PersonnelReadinessStreams>>>();

interface PersonnelReadinessRequest {
	locals: App.Locals;
	cookies: Cookies;
	params: { orgId: string };
}

/**
 * The Readiness page and the detail layout's badge share one set of item reads per request, so a
 * save that refreshes both loads reads each source once.
 */
export function loadRequestPersonnelReadiness(
	{ locals, cookies, params }: PersonnelReadinessRequest,
	person: Personnel,
	asOf: string,
	loadWithContextFn: typeof loadWithContext = loadWithContext
): Promise<PersonnelReadinessStreams> {
	let byPerson = readinessByRequest.get(locals);
	if (!byPerson) readinessByRequest.set(locals, (byPerson = new Map()));
	const key = `${params.orgId}/${person.id}/${asOf}`;
	let streams = byPerson.get(key);
	if (!streams) {
		streams = loadWithContextFn(locals, cookies, params.orgId, {
			context: createRequestPersonnelReadinessContext,
			policyAction: POLICY_ACTION_CATALOG.personnel.readSensitiveRecords,
			policyResource: { kind: 'unscoped' },
			fn: async (ctx) => createPersonnelReadinessStreams(ctx, person, asOf)
		});
		byPerson.set(key, streams);
	}
	return streams;
}

/** The Readiness tab badge. Null hides it from a viewer who cannot read the Person's sensitive records. */
export function loadRequestPersonnelReadinessBadge(
	request: PersonnelReadinessRequest,
	person: Personnel,
	asOf: string,
	loadWithContextFn: typeof loadWithContext = loadWithContext
): Promise<PersonnelAttention['readinessBadge'] | null> {
	return keepStreamedRejectionObserved(
		loadRequestPersonnelReadiness(request, person, asOf, loadWithContextFn).then(
			(readiness) => readiness.attention.then((attention) => attention.readinessBadge),
			(error: unknown) => {
				if (isHttpError(error, 403)) return null;
				throw error;
			}
		)
	);
}
