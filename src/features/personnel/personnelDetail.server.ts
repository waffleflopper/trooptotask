import type { PolicyAuditSink } from '$lib/access/policyAuditSink';
import type { OrganizationAccessGrant } from '$lib/access/memberAccessShape';
import { POLICY_ACTION_CATALOG, type FeatureLanePolicyAction } from '$lib/access/policyEvaluator';
import { policyResourceForGroup, requireFeaturePolicy } from '$lib/access/index.server';
import { fail } from '$lib/errors';
import { readLossWarningWindowDays } from '$features/organization/contracts';
import { formatDate, formatDisplayDate, parseDate } from '$lib/utils/dates';
import type {
	PersonnelAvailabilityPeriod,
	PersonnelCalendarStatusSnapshot,
	PersonnelRecordPersistence
} from './contracts';
import type { PersonnelDetailHeader, PersonnelReadinessLane } from './personnel-detail.types';
import type { Personnel } from './personnel.types';

interface PersonnelDetailContext {
	auth: OrganizationAccessGrant;
	audit: PolicyAuditSink;
	organizationPersonnel: Pick<PersonnelRecordPersistence, 'findBySlug'>;
	scope: { requireGroupAccess(personnelId: string): Promise<void> };
}

/** Resolve the shared detail header without excluding archived Personnel. */
export async function loadPersonnelDetailHeader(
	ctx: PersonnelDetailContext,
	personnelSlug: string
): Promise<PersonnelDetailHeader> {
	const person = await ctx.organizationPersonnel.findBySlug(personnelSlug);
	if (!person) fail(404, 'Personnel record not found');
	await requireFeaturePolicy(
		ctx,
		POLICY_ACTION_CATALOG.personnel.manageRecords,
		policyResourceForGroup(person.groupId),
		'personnel',
		person.id
	);
	await ctx.scope.requireGroupAccess(person.id);
	return { person };
}

/**
 * The page resolves the Person and its Group access once through the header; each lane still
 * requires its own feature action against that Person before it reads.
 */
export async function authorizePersonnelLane(
	ctx: Pick<PersonnelDetailContext, 'auth' | 'audit'>,
	person: Personnel,
	action: FeatureLanePolicyAction,
	resourceType: string
): Promise<Personnel> {
	await requireFeaturePolicy(ctx, action, policyResourceForGroup(person.groupId), resourceType, person.id);
	return person;
}

function asOfDate(value?: string | Date): Date {
	if (!value) return parseDate(formatDate(new Date()));
	return typeof value === 'string' ? parseDate(value) : parseDate(formatDate(value));
}

function dateRangeDetail(entry: PersonnelAvailabilityPeriod): string {
	if (entry.startDate === entry.endDate) return formatDisplayDate(entry.startDate);
	return entry.endDate ? `through ${formatDisplayDate(entry.endDate)}` : `since ${formatDisplayDate(entry.startDate)}`;
}

export async function loadAvailabilityReadinessLane(
	ctx: Pick<PersonnelDetailContext, 'auth' | 'audit'>,
	person: Personnel,
	asOf: string | Date | undefined,
	listEntries: (input: {
		rangeStart: string;
		rangeEnd: string;
		personnelId: string;
		orderByEndDate: true;
	}) => Promise<PersonnelAvailabilityPeriod[]>,
	listStatusTypes: () => Promise<PersonnelCalendarStatusSnapshot[]>
): Promise<PersonnelReadinessLane> {
	await authorizePersonnelLane(ctx, person, POLICY_ACTION_CATALOG.calendar.viewAvailability, 'availability');
	const today = formatDate(asOfDate(asOf));
	const [entries, statusTypes] = await Promise.all([
		listEntries({ rangeStart: today, rangeEnd: today, personnelId: person.id, orderByEndDate: true }),
		listStatusTypes()
	]);
	const statusById = new Map(statusTypes.map((status) => [status.id, status]));
	const current = entries[0];
	if (!current) {
		return {
			label: 'Availability',
			value: 'Present',
			detail: 'No active Calendar status for today.',
			tone: 'good'
		};
	}
	const statusName = statusById.get(current.statusTypeId)?.name ?? 'Unavailable';
	const note = current.note ? ` ${current.note}` : '';
	return {
		label: 'Availability',
		value: statusName,
		detail: `${statusName} ${dateRangeDetail(current)}.${note}`,
		tone: 'watch'
	};
}

/** The detail lane intentionally evaluates ETS alone; global loss signals also use DEROS. */
export async function loadLossTrackingReadinessLane(
	ctx: Pick<PersonnelDetailContext, 'auth' | 'audit'>,
	person: Personnel,
	asOf: string | Date | undefined,
	readWarningWindowDays: () => Promise<number | null | undefined>
): Promise<PersonnelReadinessLane> {
	await authorizePersonnelLane(ctx, person, POLICY_ACTION_CATALOG.personnel.viewRoster, 'personnel');
	if (!person.ets) {
		return {
			label: 'Loss Tracking',
			value: 'Missing ETS',
			detail: 'No ETS date is set on the personnel record.',
			tone: 'bad'
		};
	}
	const daysUntilEts = Math.floor((parseDate(person.ets).getTime() - asOfDate(asOf).getTime()) / (24 * 60 * 60 * 1000));
	const detail =
		daysUntilEts < 0
			? `ETS ${formatDisplayDate(person.ets)} was ${Math.abs(daysUntilEts)} days ago.`
			: `ETS ${formatDisplayDate(person.ets)} is ${daysUntilEts} days away.`;
	if (daysUntilEts < 0) return { label: 'Loss Tracking', value: 'Action needed', detail, tone: 'bad' };
	const warningWindowDays = await readLossWarningWindowDays(readWarningWindowDays());
	if (warningWindowDays === null) {
		return {
			label: 'Loss Tracking',
			value: 'Unavailable',
			detail: `${detail} Loss warnings could not be loaded. Reload the page to try again.`,
			tone: 'neutral'
		};
	}
	return {
		label: 'Loss Tracking',
		value: daysUntilEts <= warningWindowDays ? 'Action needed' : 'No loss risk',
		detail,
		tone: daysUntilEts <= warningWindowDays ? 'watch' : 'good'
	};
}
