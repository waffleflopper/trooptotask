import { error } from '@sveltejs/kit';
import type { PageServerLoadEvent } from './$types';
import { loadWithContext } from '$lib/server/adapters/httpAdapter';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import type { UseCaseContext } from '$lib/server/core/ports';
import type {
	PersonnelCounselingRecord,
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

async function resolvePersonnelId(ctx: UseCaseContext, personnelSlug: string): Promise<string> {
	const person = await ctx.store.findOne<{ id: string }>('personnel', ctx.auth.orgId, { slug: personnelSlug }, 'id');
	if (!person) {
		error(404, 'Personnel record not found');
	}
	await ctx.auth.requireGroupAccess(person.id);
	return person.id;
}

export function _createPersonnelDetailPageLoad(deps: PersonnelDetailPageLoadDeps = {}) {
	const loadWithContextFn = deps.loadWithContext ?? loadWithContext;

	return async ({ params, locals, cookies, depends }: PageServerLoadEvent) => {
		depends('app:personnel-detail');
		const { orgId, personnelSlug } = params;

		const personnelDetail = await loadWithContextFn(locals, cookies, orgId, {
			permission: 'personnel',
			policyAction: POLICY_ACTION_CATALOG.personnel.manageRecords,
			policyResource: { kind: 'unscoped' },
			fn: async (ctx) => {
				const personnelId = await resolvePersonnelId(ctx, personnelSlug);
				return createPersonnelDetailStreams(ctx, personnelId);
			}
		});

		return {
			personnelDetail
		};
	};
}

export const load = _createPersonnelDetailPageLoad();
