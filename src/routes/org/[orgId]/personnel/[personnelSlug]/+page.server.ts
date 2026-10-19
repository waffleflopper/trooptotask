import { loadPersonnelCalendarWindow } from '$features/calendar/index.server';
import type { Personnel, PersonnelExtendedInfo } from '$features/personnel/contracts';
import {
	listPersonnelCounselingRecords,
	listPersonnelLeaderNotes,
	readPersonnelExtendedInfo
} from '$features/personnel/index.server';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { RequestFailure } from '$lib/errors';
import { loadWithContext } from '$lib/server/adapters/httpAdapter';
import { loadRequestPersonnelDetailHeader } from '$lib/server/adapters/personnelDetailHeaderLoad';
import { loadRequestPersonnelReadiness } from '$lib/server/adapters/personnelReadinessLoad';
import { createRequestPersonnelOverviewContext } from '$lib/server/adapters/requestContexts.server';
import { keepStreamedRejectionObserved } from '$lib/server/adapters/streamedWorkspace';
import { viewerToday } from '$lib/server/viewerDay.server';
import { fromDayNumber, toDayNumber } from '$lib/utils/dayNumber';
import type { PageServerLoadEvent } from './$types';

const NEXT_DAYS = 14;

/**
 * A section the viewer may not read hides; any other failure still rejects to its error state.
 * Streams settle after the request boundary, so their denials arrive as the raw RequestFailure.
 */
function hiddenWhenDenied<T>(source: Promise<T>): Promise<T | null> {
	return source.catch((error: unknown) => {
		if (error instanceof RequestFailure && error.status === 403) return null;
		throw error;
	});
}

function reachFrom(info: PersonnelExtendedInfo | null) {
	if (!info) return null;
	const emergency = {
		name: info.emergencyContactName,
		relationship: info.emergencyContactRelationship,
		phone: info.emergencyContactPhone
	};
	return {
		phone: info.personalPhone,
		email: info.personalEmail,
		emergency: emergency.name || emergency.relationship || emergency.phone ? emergency : null
	};
}

function createOverviewStreams(
	ctx: ReturnType<typeof createRequestPersonnelOverviewContext>,
	person: Personnel,
	asOf: string
) {
	const range = { rangeStart: asOf, rangeEnd: fromDayNumber(toDayNumber(asOf) + NEXT_DAYS - 1) };
	return {
		nextDays: keepStreamedRejectionObserved(hiddenWhenDenied(loadPersonnelCalendarWindow(ctx.calendar, person, range))),
		reach: keepStreamedRejectionObserved(readPersonnelExtendedInfo(ctx.extendedInfo, person.id).then(reachFrom)),
		lastCounseling: keepStreamedRejectionObserved(
			listPersonnelCounselingRecords(ctx.artifacts, person.id, 1).then((records) => records[0] ?? null)
		),
		latestNote: keepStreamedRejectionObserved(
			listPersonnelLeaderNotes(ctx.leaderNotes, person.id, 1).then((notes) => notes[0] ?? null)
		)
	};
}

export interface PersonnelOverviewPageLoadDeps {
	loadWithContext?: typeof loadWithContext;
	loadReadiness?: typeof loadRequestPersonnelReadiness;
}

export function _createPersonnelOverviewPageLoad(deps: PersonnelOverviewPageLoadDeps = {}) {
	const loadWithContextFn = deps.loadWithContext ?? loadWithContext;
	const loadReadiness = deps.loadReadiness ?? loadRequestPersonnelReadiness;

	return async (event: PageServerLoadEvent) => {
		const { params, locals, cookies, depends } = event;
		depends('app:personnel-detail');
		const { person } = await loadRequestPersonnelDetailHeader(event, loadWithContextFn);
		const asOf = viewerToday(cookies);
		const [readiness, streams] = await Promise.all([
			loadReadiness(event, person, asOf, loadWithContextFn),
			loadWithContextFn(locals, cookies, params.orgId, {
				context: createRequestPersonnelOverviewContext,
				policyAction: POLICY_ACTION_CATALOG.personnel.readSensitiveRecords,
				policyResource: { kind: 'unscoped' },
				fn: async (ctx) => createOverviewStreams(ctx, person, asOf)
			})
		]);
		return {
			asOf,
			overview: {
				...streams,
				attention: readiness.attention,
				evaluation: keepStreamedRejectionObserved(hiddenWhenDenied(readiness.evaluation))
			}
		};
	};
}

export const load = _createPersonnelOverviewPageLoad();
