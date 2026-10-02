import {
	personnelArtifactsContext,
	loadWithContext,
	personnelLeaderNoteContext
} from '$lib/server/adapters/httpAdapter';
import type { PageServerLoadEvent } from './$types';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import type { UseCaseContext } from '$lib/server/core/ports';
import type { PersonnelDetailHeader, PersonnelDetailStreams } from '$features/personnel/contracts';
import {
	currentPersonnelReadinessDate,
	loadAvailabilityReadinessLane,
	loadLossTrackingReadinessLane,
	loadPersonnelForLane,
	listPersonnelLeaderNotes,
	readPersonnelExtendedInfo,
	listPersonnelCounselingRecords,
	listPersonnelDocuments,
	listPersonnelFollowUps
} from '$features/personnel/index.server';
import { loadTrainingReadinessLane } from '$features/training/index.server';
import { loadRatingSchemeReadinessLane } from '$features/rating-scheme/index.server';
import { loadCriticalTasksReadinessLane } from '$features/critical-tasks/index.server';
import { listAvailabilityEntries, listStatusTypes } from '$features/calendar/index.server';

function createPersonnelDetailStreams(ctx: UseCaseContext, personnelId: string): PersonnelDetailStreams {
	const artifactContext = personnelArtifactsContext(ctx);
	const extendedInfo = readPersonnelExtendedInfo(ctx, personnelId);
	const readinessAsOf = currentPersonnelReadinessDate();
	return {
		readinessLanes: {
			availability: loadAvailabilityReadinessLane(
				ctx,
				personnelId,
				readinessAsOf,
				(input) => listAvailabilityEntries(ctx, input),
				() => listStatusTypes(ctx.store, ctx.auth.orgId)
			),
			training: loadTrainingReadinessLane({
				store: ctx.store,
				orgId: ctx.auth.orgId,
				personnelId,
				asOf: readinessAsOf,
				loadAuthorizedPerson: () =>
					loadPersonnelForLane(ctx, personnelId, POLICY_ACTION_CATALOG.training.viewRecords, 'training_record')
			}),
			criticalTasks: loadCriticalTasksReadinessLane({
				store: ctx.store,
				orgId: ctx.auth.orgId,
				personnelId,
				asOf: readinessAsOf,
				loadAuthorizedPerson: () =>
					loadPersonnelForLane(
						ctx,
						personnelId,
						POLICY_ACTION_CATALOG.criticalTasks.viewReadiness,
						'personnel_ict_completion'
					)
			}),
			ratingScheme: loadRatingSchemeReadinessLane({
				store: ctx.rawStore,
				orgId: ctx.auth.orgId,
				personnelId,
				loadAuthorizedPerson: () =>
					loadPersonnelForLane(ctx, personnelId, POLICY_ACTION_CATALOG.ratingScheme.viewEntries, 'rating_scheme_entry')
			}),
			lossTracking: loadLossTrackingReadinessLane(ctx, personnelId, readinessAsOf, async () => {
				const settings = await ctx.store.findOne<{ loss_warning_window_days?: number | null }>(
					'organizations',
					ctx.auth.orgId,
					{ id: ctx.auth.orgId },
					'loss_warning_window_days'
				);
				return settings?.loss_warning_window_days;
			})
		},
		// The three owned artifact reads share one request-local authorization context.
		extendedInfo,
		counselingRecords: listPersonnelCounselingRecords(artifactContext, personnelId, 5),
		documents: listPersonnelDocuments(artifactContext, personnelId, 5),
		leaderNotes: listPersonnelLeaderNotes(personnelLeaderNoteContext(ctx), personnelId, 1),
		followUps: listPersonnelFollowUps(artifactContext, personnelId)
	};
}

type LoadWithContext = typeof loadWithContext;

export interface PersonnelDetailPageLoadDeps {
	loadWithContext?: LoadWithContext;
}

interface PersonnelDetailParentData {
	personnelDetailHeader: PersonnelDetailHeader;
}

export function _createPersonnelDetailPageLoad(deps: PersonnelDetailPageLoadDeps = {}) {
	const loadWithContextFn = deps.loadWithContext ?? loadWithContext;

	return async ({ params, locals, cookies, depends, parent }: PageServerLoadEvent) => {
		depends('app:personnel-detail');
		const { orgId } = params;
		const parentData = (await parent()) as PersonnelDetailParentData;
		const personnelId = parentData.personnelDetailHeader.person.id;

		const personnelDetail = await loadWithContextFn(locals, cookies, orgId, {
			policyAction: POLICY_ACTION_CATALOG.personnel.readSensitiveRecords,
			policyResource: { kind: 'unscoped' },
			fn: async (ctx) => createPersonnelDetailStreams(ctx, personnelId)
		});

		return {
			personnelDetail
		};
	};
}

export const load = _createPersonnelDetailPageLoad();
