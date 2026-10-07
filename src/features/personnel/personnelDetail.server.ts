import type { PolicyAuditSink } from '$lib/access/policyAuditSink';
import type { OrganizationAccessGrant } from '$lib/access/memberAccessShape';
import { POLICY_ACTION_CATALOG, type FeatureLanePolicyAction } from '$lib/access/policyEvaluator';
import { policyResourceForGroup, requireFeaturePolicy } from '$lib/access/index.server';
import { fail } from '$lib/errors';
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
	organizationPersonnel: Pick<PersonnelRecordPersistence, 'findBySlug' | 'findById'>;
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

/** Delivery selects the independently required feature action before any lane reads. */
export async function loadPersonnelForLane(
	ctx: PersonnelDetailContext,
	personnelId: string,
	action: FeatureLanePolicyAction,
	resourceType: string
): Promise<Personnel> {
	const person = await ctx.organizationPersonnel.findById(personnelId);
	if (!person) fail(404, 'Personnel record not found');
	await ctx.scope.requireGroupAccess(personnelId);
	await requireFeaturePolicy(ctx, action, policyResourceForGroup(person.groupId), resourceType, personnelId);
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
	ctx: PersonnelDetailContext,
	personnelId: string,
	asOf: string | Date | undefined,
	listEntries: (input: {
		rangeStart: string;
		rangeEnd: string;
		personnelId: string;
		orderByEndDate: true;
	}) => Promise<PersonnelAvailabilityPeriod[]>,
	listStatusTypes: () => Promise<PersonnelCalendarStatusSnapshot[]>
): Promise<PersonnelReadinessLane> {
	await loadPersonnelForLane(ctx, personnelId, POLICY_ACTION_CATALOG.calendar.viewAvailability, 'availability');
	const today = formatDate(asOfDate(asOf));
	const [entries, statusTypes] = await Promise.all([
		listEntries({ rangeStart: today, rangeEnd: today, personnelId, orderByEndDate: true }),
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
	ctx: PersonnelDetailContext,
	personnelId: string,
	asOf: string | Date | undefined,
	readWarningWindowDays: () => Promise<number | null | undefined>
): Promise<PersonnelReadinessLane> {
	const person = await loadPersonnelForLane(ctx, personnelId, POLICY_ACTION_CATALOG.personnel.viewRoster, 'personnel');
	if (!person.ets) {
		return {
			label: 'Loss Tracking',
			value: 'Missing ETS',
			detail: 'No ETS date is set on the personnel record.',
			tone: 'bad'
		};
	}
	const daysUntilEts = Math.floor((parseDate(person.ets).getTime() - asOfDate(asOf).getTime()) / (24 * 60 * 60 * 1000));
	const warningWindowDays = (await readWarningWindowDays().catch(() => null)) ?? 180;
	const detail =
		daysUntilEts < 0
			? `ETS ${formatDisplayDate(person.ets)} was ${Math.abs(daysUntilEts)} days ago.`
			: `ETS ${formatDisplayDate(person.ets)} is ${daysUntilEts} days away.`;
	return {
		label: 'Loss Tracking',
		value: daysUntilEts <= warningWindowDays ? 'Action needed' : 'No loss risk',
		detail,
		tone: daysUntilEts < 0 ? 'bad' : daysUntilEts <= warningWindowDays ? 'watch' : 'good'
	};
}

export function currentPersonnelReadinessDate(): string {
	return formatDate(new Date());
}
