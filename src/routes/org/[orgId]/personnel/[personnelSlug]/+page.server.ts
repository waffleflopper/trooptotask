import type { PageServerLoadEvent } from './$types';
import { loadWithContext } from '$lib/server/adapters/httpAdapter';
import type { UseCaseContext } from '$lib/server/core/ports';
import type {
	PersonnelCounselingRecord,
	PersonnelDetailHeader,
	PersonnelDetailStreams,
	PersonnelLeaderNote
} from '$features/personnel/personnel-detail.types';
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

interface CounselingRecordRow {
	id: string;
	date_conducted: string;
	subject: string | null;
	notes: string | null;
	file_path: string | null;
}

async function loadCounselingRecords(ctx: UseCaseContext, personnelId: string): Promise<PersonnelCounselingRecord[]> {
	const rows = await ctx.store.findMany<CounselingRecordRow>(
		'counseling_records',
		ctx.auth.orgId,
		{ personnel_id: personnelId },
		{
			orderBy: [{ column: 'date_conducted', ascending: false }]
		}
	);

	return rows.map((row) => ({
		dateConducted: row.date_conducted,
		title: row.subject || 'Uploaded counseling PDF',
		summary: row.notes || undefined,
		status: row.file_path ? ('uploaded' as const) : ('needs-title' as const),
		uploadedBy: 'Leader upload',
		filePath: row.file_path ?? `pending-upload/${row.id}.pdf`
	}));
}

async function loadLeaderNotes(
	extendedInfo: Promise<Awaited<ReturnType<typeof readPersonnelExtendedInfo>>>
): Promise<PersonnelLeaderNote[]> {
	const info = await extendedInfo;
	if (!info?.leaderNotes) return [];

	return [
		{
			author: 'Leader notes',
			date: new Date().toISOString().slice(0, 10),
			text: info.leaderNotes
		}
	];
}

async function loadDerivedFollowUps() {
	return [
		'Review board packet checklist with 1SG.',
		'Verify HIPAA completion before next staff duty cycle.',
		'Acknowledge award tracking for upcoming ETS.',
		'Update leader notes after family care calendar review.'
	];
}

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
		counselingRecords: loadCounselingRecords(ctx, personnelId),
		leaderNotes: loadLeaderNotes(extendedInfo),
		followUps: loadDerivedFollowUps()
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
