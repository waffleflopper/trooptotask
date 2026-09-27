import type { PageServerLoadEvent } from './$types';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { loadWithContext, personnelLeaderNoteContext } from '$lib/server/adapters/httpAdapter';
import type { UseCaseContext } from '$lib/server/core/ports';
import type { PersonnelDetailHeader, PersonnelDetailStreams } from '$features/personnel/personnel-detail.types';
import { readPersonnelExtendedInfo } from '$lib/server/core/useCases/personnelExtendedInfo';
import {
	currentPersonnelReadinessDate,
	loadAvailabilityReadinessLane,
	loadCriticalTasksReadinessLane,
	loadLossTrackingReadinessLane,
	loadRatingSchemeReadinessLane,
	loadTrainingReadinessLane
} from '$lib/server/core/useCases/personnelReadinessLanes';
import { listPersonnelLeaderNotes } from '$features/personnel/index.server';
import { listAvailabilityEntries } from '$features/calendar/index.server';
import { listPersonnelCounselingRecords } from '$lib/server/core/useCases/personnelCounselingRecords';
import { listPersonnelDocuments } from '$lib/server/core/useCases/personnelDocuments';
import { listPersonnelFollowUps } from '$lib/server/core/useCases/personnelFollowUps';

function createPersonnelDetailStreams(ctx: UseCaseContext, personnelId: string): PersonnelDetailStreams {
	const extendedInfo = readPersonnelExtendedInfo(ctx, personnelId);
	const readinessAsOf = currentPersonnelReadinessDate();
	return {
		readinessLanes: {
			availability: loadAvailabilityReadinessLane(ctx, personnelId, readinessAsOf, listAvailabilityEntries),
			training: loadTrainingReadinessLane(ctx, personnelId, readinessAsOf),
			criticalTasks: loadCriticalTasksReadinessLane(ctx, personnelId, readinessAsOf),
			ratingScheme: loadRatingSchemeReadinessLane(ctx, personnelId, readinessAsOf),
			lossTracking: loadLossTrackingReadinessLane(ctx, personnelId, readinessAsOf)
		},
		// Artifact use cases keep their own authorization boundary. The shared helper caches
		// the repeated Personnel access check per request context so these dashboard panels
		// do not each reload the same Personnel row.
		extendedInfo,
		counselingRecords: listPersonnelCounselingRecords(ctx, personnelId, 5),
		documents: listPersonnelDocuments(ctx, personnelId, 5),
		leaderNotes: listPersonnelLeaderNotes(personnelLeaderNoteContext(ctx), personnelId, 1),
		followUps: listPersonnelFollowUps(ctx, personnelId)
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
