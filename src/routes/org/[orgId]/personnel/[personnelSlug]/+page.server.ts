import type { PageServerLoadEvent } from './$types';
import { loadWithContext } from '$lib/server/adapters/httpAdapter';
import type { UseCaseContext } from '$lib/server/core/ports';
import type { PersonnelDetailHeader, PersonnelDetailStreams } from '$features/personnel/personnel-detail.types';
import { readPersonnelExtendedInfo } from '$lib/server/core/useCases/personnelExtendedInfo';
import {
	currentPersonnelReadinessDate,
	loadAvailabilityReadinessLane,
	loadCriticalTasksReadinessLane,
	loadDutyRosterReadinessLane,
	loadLossTrackingReadinessLane,
	loadRatingSchemeReadinessLane,
	loadTrainingReadinessLane
} from '$lib/server/core/useCases/personnelReadinessLanes';
import { listPersonnelLeaderNotes } from '$lib/server/core/useCases/personnelLeaderNotes';
import { listPersonnelCounselingRecords } from '$lib/server/core/useCases/personnelCounselingRecords';
import { listPersonnelDocuments } from '$lib/server/core/useCases/personnelDocuments';
import { listPersonnelFollowUps } from '$lib/server/core/useCases/personnelFollowUps';

function createPersonnelDetailStreams(ctx: UseCaseContext, personnelId: string): PersonnelDetailStreams {
	const extendedInfo = readPersonnelExtendedInfo(ctx, personnelId);
	const readinessAsOf = currentPersonnelReadinessDate();
	return {
		readinessLanes: {
			availability: loadAvailabilityReadinessLane(ctx, personnelId, readinessAsOf),
			training: loadTrainingReadinessLane(ctx, personnelId, readinessAsOf),
			criticalTasks: loadCriticalTasksReadinessLane(ctx, personnelId, readinessAsOf),
			dutyRoster: loadDutyRosterReadinessLane(ctx, personnelId, readinessAsOf),
			ratingScheme: loadRatingSchemeReadinessLane(ctx, personnelId, readinessAsOf),
			lossTracking: loadLossTrackingReadinessLane(ctx, personnelId, readinessAsOf)
		},
		extendedInfo,
		counselingRecords: listPersonnelCounselingRecords(ctx, personnelId, 5),
		documents: listPersonnelDocuments(ctx, personnelId, 5),
		leaderNotes: listPersonnelLeaderNotes(ctx, personnelId, 1),
		followUps: listPersonnelFollowUps(ctx, personnelId, 5)
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
			permission: 'none',
			fn: async (ctx) => createPersonnelDetailStreams(ctx, personnelId)
		});

		return {
			personnelDetail
		};
	};
}

export const load = _createPersonnelDetailPageLoad();
