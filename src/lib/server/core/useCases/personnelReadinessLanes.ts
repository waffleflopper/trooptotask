import { POLICY_ACTION_CATALOG, type FeatureLanePolicyAction } from '$lib/access/policyEvaluator';
import type { UseCaseContext } from '$lib/server/core/ports';
import { fail } from '$lib/server/core/errors';
import type { Personnel } from '$features/personnel/personnel.types';
import type { PersonnelAvailabilityPeriod, PersonnelCalendarStatusSnapshot } from '$features/personnel/contracts';
import type { PersonnelReadinessLane } from '$features/personnel/personnel-detail.types';
import { PersonnelEntity } from '$features/personnel/index.server';
import { RatingSchemeEntryEntity } from '$lib/server/entities/ratingSchemeEntry';
import { formatDate, formatDisplayDate, parseDate } from '$lib/utils/dates';
import { policyResourceForGroup, requireFeaturePolicy } from './featurePolicy';

interface PersonnelPolicyRow extends Record<string, unknown> {
	id: string;
	group_id: string | null;
}

interface OrgSettingsRow {
	loss_warning_window_days?: number | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export async function loadPersonnelForLane(
	ctx: UseCaseContext,
	personnelId: string,
	action: FeatureLanePolicyAction,
	resourceType: string
): Promise<Personnel> {
	const lookupStore = ctx.rawStore ?? ctx.store;
	const row = await lookupStore.findOne<PersonnelPolicyRow>(
		'personnel',
		ctx.auth.orgId,
		{ id: personnelId },
		PersonnelEntity.select
	);
	if (!row) fail(404, 'Personnel record not found');

	await ctx.scope.requireGroupAccess(personnelId);
	await requireFeaturePolicy(ctx, action, policyResourceForGroup(row.group_id), resourceType, personnelId);
	return PersonnelEntity.fromDb(row);
}

function asOfDate(value?: string | Date): Date {
	if (!value) return parseDate(formatDate(new Date()));
	return typeof value === 'string' ? parseDate(value) : parseDate(formatDate(value));
}

function daysBetween(from: Date, to: Date): number {
	return Math.floor((to.getTime() - from.getTime()) / DAY_MS);
}

function dateRangeDetail(entry: PersonnelAvailabilityPeriod): string {
	if (entry.startDate === entry.endDate) return formatDisplayDate(entry.startDate);
	return entry.endDate ? `through ${formatDisplayDate(entry.endDate)}` : `since ${formatDisplayDate(entry.startDate)}`;
}

export async function loadAvailabilityReadinessLane(
	ctx: UseCaseContext,
	personnelId: string,
	asOf: string | Date | undefined,
	listEntries: (
		ctx: UseCaseContext,
		input: { rangeStart: string; rangeEnd: string; personnelId: string; orderByEndDate: true }
	) => Promise<PersonnelAvailabilityPeriod[]>,
	listStatusTypes: (store: UseCaseContext['store'], orgId: string) => Promise<PersonnelCalendarStatusSnapshot[]>
): Promise<PersonnelReadinessLane> {
	await loadPersonnelForLane(ctx, personnelId, POLICY_ACTION_CATALOG.calendar.viewAvailability, 'availability');
	const today = formatDate(asOfDate(asOf));
	const [entries, statusTypes] = await Promise.all([
		listEntries(ctx, {
			rangeStart: today,
			rangeEnd: today,
			personnelId,
			orderByEndDate: true
		}),
		listStatusTypes(ctx.store, ctx.auth.orgId)
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

	const status: PersonnelCalendarStatusSnapshot | undefined = statusById.get(current.statusTypeId);
	const statusName = status?.name ?? 'Unavailable';
	const note = current.note ? ` ${current.note}` : '';
	return {
		label: 'Availability',
		value: statusName,
		detail: `${statusName} ${dateRangeDetail(current)}.${note}`,
		tone: 'watch'
	};
}

export async function loadRatingSchemeReadinessLane(
	ctx: UseCaseContext,
	personnelId: string,
	_asOf?: string | Date
): Promise<PersonnelReadinessLane> {
	await loadPersonnelForLane(ctx, personnelId, POLICY_ACTION_CATALOG.ratingScheme.viewEntries, 'rating_scheme_entry');
	const rows = await ctx.store.findMany<Record<string, unknown>>(
		'rating_scheme_entries',
		ctx.auth.orgId,
		{ rated_person_id: personnelId },
		{
			select: RatingSchemeEntryEntity.select,
			orderBy: [{ column: 'rating_period_end', ascending: false }]
		}
	);
	const active = RatingSchemeEntryEntity.fromDbArray(rows).find((entry) => entry.status !== 'completed');
	if (!active) {
		return {
			label: 'Rating Scheme',
			value: 'Not assigned',
			detail: 'No active Rating Scheme entry for this Soldier.',
			tone: 'bad'
		};
	}

	const hasRater = hasRatingPerson(active.raterPersonId, active.raterName);
	const hasSeniorRater = hasRatingPerson(active.seniorRaterPersonId, active.seniorRaterName);
	if (hasRater && hasSeniorRater) {
		return {
			label: 'Rating Scheme',
			value: 'Aligned',
			detail: 'Rater and senior rater assigned.',
			tone: 'info'
		};
	}

	return {
		label: 'Rating Scheme',
		value: hasRater ? 'Senior rater needed' : 'Rater needed',
		detail: `${hasRater ? 'Rater assigned' : 'Rater missing'}. ${hasSeniorRater ? 'Senior rater assigned' : 'Senior rater missing'}.`,
		tone: 'watch'
	};
}

function hasRatingPerson(id: string | null, name: string | null): boolean {
	return Boolean(id || name?.trim());
}

export async function loadLossTrackingReadinessLane(
	ctx: UseCaseContext,
	personnelId: string,
	asOf?: string | Date
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

	const today = asOfDate(asOf);
	const daysUntilEts = daysBetween(today, parseDate(person.ets));
	const settings = await ctx.store
		.findOne<OrgSettingsRow>('organizations', ctx.auth.orgId, { id: ctx.auth.orgId }, 'loss_warning_window_days')
		.catch(() => null);
	const warningWindowDays = settings?.loss_warning_window_days ?? 180;
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
