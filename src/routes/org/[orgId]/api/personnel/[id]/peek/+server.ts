import { loadPersonnelCalendarWindow } from '$features/calendar/index.server';
import {
	isRosterPeekSection,
	ROSTER_PEEK_DAYS,
	type Personnel,
	type RosterPeekRead,
	type RosterPeekSection,
	type RosterPeekValues
} from '$features/personnel/contracts';
import {
	listPersonnelFollowUps,
	listPersonnelLeaderNotes,
	loadPersonnelPeekPerson,
	readPersonnelExtendedInfo
} from '$features/personnel/index.server';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { fail, RequestFailure } from '$lib/errors';
import { handle, privateJson, type RouteConfig } from '$lib/server/adapters/httpAdapter';
import { createPersonnelReadinessStreams } from '$lib/server/adapters/personnelReadinessLoad';
import {
	createRequestPersonnelDetailContext,
	createRequestPersonnelOverviewContext,
	createRequestPersonnelReadinessContext,
	type AdmittedOrganizationRequest
} from '$lib/server/adapters/requestContexts.server';
import { viewerToday } from '$lib/server/viewerDay.server';
import { fromDayNumber, toDayNumber } from '$lib/utils/dayNumber';
import type { RequestEvent } from '@sveltejs/kit';
import { routePersonnelId } from '../routeIds';

export function _createPeekContext(request: AdmittedOrganizationRequest) {
	return {
		detail: createRequestPersonnelDetailContext(request),
		overview: createRequestPersonnelOverviewContext(request),
		readiness: createRequestPersonnelReadinessContext(request)
	};
}

type PeekContext = ReturnType<typeof _createPeekContext>;
type PeekInput = { personnelId: string; section: RosterPeekSection; asOf: string };

const SECTION_READS: {
	[S in RosterPeekSection]: (ctx: PeekContext, person: Personnel, asOf: string) => Promise<RosterPeekValues[S]>;
} = {
	identity: (ctx, person) =>
		readPersonnelExtendedInfo(ctx.overview.extendedInfo, person.id).then((info) => ({
			phone: info?.personalPhone || null
		})),
	next7: (ctx, person, asOf) =>
		loadPersonnelCalendarWindow(ctx.overview.calendar, person, {
			rangeStart: asOf,
			rangeEnd: fromDayNumber(toDayNumber(asOf) + ROSTER_PEEK_DAYS - 1)
		}),
	attention: (ctx, person, asOf) =>
		createPersonnelReadinessStreams(ctx.readiness, person, asOf, { omitDenied: true }).attention,
	followUps: (ctx, person) =>
		listPersonnelFollowUps(ctx.overview.artifacts, person.id).then((rows) =>
			rows.filter((row) => row.status === 'open')
		),
	note: (ctx, person) =>
		listPersonnelLeaderNotes(ctx.overview.leaderNotes, person.id, 1).then((notes) => notes[0] ?? null)
};

async function readPeekSection(ctx: PeekContext, { personnelId, section, asOf }: PeekInput): Promise<RosterPeekRead> {
	const person = await loadPersonnelPeekPerson(ctx.detail, personnelId);
	try {
		return { state: 'ready', value: await SECTION_READS[section](ctx, person, asOf) };
	} catch (error) {
		if (error instanceof RequestFailure && error.status === 403) return { state: 'hidden' };
		throw error;
	}
}

export const _getConfig = {
	context: _createPeekContext,
	policyAction: POLICY_ACTION_CATALOG.personnel.readSensitiveRecords,
	policyResource: { kind: 'unscoped' },
	parseInput: (event: RequestEvent) => {
		const section = event.url.searchParams.get('section');
		if (!isRosterPeekSection(section)) fail(400, 'Invalid section');
		return { personnelId: routePersonnelId(event), section, asOf: viewerToday(event.cookies) };
	},
	fn: readPeekSection,
	formatOutput: privateJson
} satisfies RouteConfig<PeekInput, RosterPeekRead, PeekContext>;

export const GET = handle(_getConfig);
