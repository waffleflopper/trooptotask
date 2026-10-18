import { listAvailabilityEntries, listStatusTypes } from '$features/calendar/index.server';
import { loadCriticalTasksReadinessLane } from '$features/critical-tasks/index.server';
import type { Personnel, PersonnelDetailStreams } from '$features/personnel/contracts';
import {
	authorizePersonnelLane,
	listPersonnelCounselingRecords,
	listPersonnelDocuments,
	listPersonnelFollowUps,
	listPersonnelLeaderNotes,
	loadAvailabilityReadinessLane,
	loadLossTrackingReadinessLane,
	readPersonnelExtendedInfo
} from '$features/personnel/index.server';
import { loadRatingSchemeReadinessLane } from '$features/rating-scheme/index.server';
import { loadTrainingReadinessLane } from '$features/training/index.server';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { loadWithContext } from '$lib/server/adapters/httpAdapter';
import { loadRequestPersonnelDetailHeader } from '$lib/server/adapters/personnelDetailHeaderLoad';
import { createRequestPersonnelDetailStreamsContext } from '$lib/server/adapters/requestContexts.server';
import { viewerToday } from '$lib/server/viewerDay.server';
import type { PageServerLoadEvent } from './$types';

function createPersonnelDetailStreams(
	contexts: ReturnType<typeof createRequestPersonnelDetailStreamsContext>,
	person: Personnel,
	readinessAsOf: string
): PersonnelDetailStreams {
	const ctx = contexts.detail;
	const personnelId = person.id;
	const artifactContext = contexts.artifacts;
	const extendedInfo = readPersonnelExtendedInfo(contexts.extendedInfo, personnelId);
	return {
		readinessLanes: {
			availability: loadAvailabilityReadinessLane(
				ctx,
				person,
				readinessAsOf,
				(input) => listAvailabilityEntries(contexts.calendar, input),
				() => listStatusTypes(contexts.calendar.calendarCatalogs)
			),
			training: loadTrainingReadinessLane({
				trainingCatalog: contexts.trainingCatalog,
				trainingCompletions: contexts.trainingCompletions,
				personnelId,
				asOf: readinessAsOf,
				loadAuthorizedPerson: () =>
					authorizePersonnelLane(ctx, person, POLICY_ACTION_CATALOG.training.viewRecords, 'training_record')
			}),
			criticalTasks: loadCriticalTasksReadinessLane({
				organizationSettings: contexts.organizationSettings,
				criticalTaskLibrary: contexts.criticalTaskLibrary,
				criticalTaskCompletions: contexts.criticalTaskCompletions,
				orgId: ctx.auth.orgId,
				personnelId,
				asOf: readinessAsOf,
				loadAuthorizedPerson: () =>
					authorizePersonnelLane(
						ctx,
						person,
						POLICY_ACTION_CATALOG.criticalTasks.viewReadiness,
						'personnel_ict_completion'
					)
			}),
			ratingScheme: loadRatingSchemeReadinessLane({
				ratingScheme: contexts.ratingScheme,
				personnelId,
				loadAuthorizedPerson: () =>
					authorizePersonnelLane(ctx, person, POLICY_ACTION_CATALOG.ratingScheme.viewEntries, 'rating_scheme_entry')
			}),
			lossTracking: loadLossTrackingReadinessLane(ctx, person, readinessAsOf, () =>
				contexts.loadLossWarningWindowDays()
			)
		},
		// The three owned artifact reads share one request-local authorization context.
		extendedInfo,
		counselingRecords: listPersonnelCounselingRecords(artifactContext, personnelId, 5),
		documents: listPersonnelDocuments(artifactContext, personnelId, 5),
		leaderNotes: listPersonnelLeaderNotes(contexts.leaderNotes, personnelId, 1),
		followUps: listPersonnelFollowUps(artifactContext, personnelId)
	};
}

type LoadWithContext = typeof loadWithContext;

export interface PersonnelDetailPageLoadDeps {
	loadWithContext?: LoadWithContext;
}

export function _createPersonnelDetailPageLoad(deps: PersonnelDetailPageLoadDeps = {}) {
	const loadWithContextFn = deps.loadWithContext ?? loadWithContext;

	return async (event: PageServerLoadEvent) => {
		const { params, locals, cookies, depends } = event;
		depends('app:personnel-detail');
		const { orgId } = params;
		const { person } = await loadRequestPersonnelDetailHeader(event, loadWithContextFn);
		const readinessAsOf = viewerToday(cookies);

		const personnelDetail = await loadWithContextFn(locals, cookies, orgId, {
			context: createRequestPersonnelDetailStreamsContext,
			policyAction: POLICY_ACTION_CATALOG.personnel.readSensitiveRecords,
			policyResource: { kind: 'unscoped' },
			fn: async (ctx) => createPersonnelDetailStreams(ctx, person, readinessAsOf)
		});

		return {
			personnelDetail
		};
	};
}

export const load = _createPersonnelDetailPageLoad();
