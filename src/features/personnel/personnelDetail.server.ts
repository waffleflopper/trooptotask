import type { PolicyAuditSink } from '$lib/access/policyAuditSink';
import type { OrganizationAccessGrant } from '$lib/access/memberAccessShape';
import { POLICY_ACTION_CATALOG, type FeatureLanePolicyAction } from '$lib/access/policyEvaluator';
import { evaluateFeaturePolicy, policyResourceForGroup, requireFeaturePolicy } from '$lib/access/index.server';
import { fail } from '$lib/errors';
import { formatDate, formatDisplayDate, parseDate } from '$lib/utils/dates';
import type {
	PersonnelAvailabilityPeriod,
	PersonnelCalendarStatusSnapshot,
	PersonnelRecordPersistence
} from './contracts';
import type { PersonnelArtifactReadPersistence } from './personnelArtifactPersistence';
import type { PersonnelSheetPersistence } from './personnelSheetPersistence';
import type {
	PersonnelDetailHeader,
	PersonnelDetailTabCounts,
	PersonnelAvailabilityToday
} from './personnel-detail.types';
import type { Personnel } from './personnel.types';

interface PersonnelDetailContext {
	auth: OrganizationAccessGrant;
	audit: PolicyAuditSink;
	organizationPersonnel: Pick<PersonnelRecordPersistence, 'findBySlug'>;
	personnelSheets: Pick<PersonnelSheetPersistence, 'findSheetForPerson'>;
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
	const [, sheet] = await Promise.all([
		ctx.scope.requireGroupAccess(person.id),
		ctx.personnelSheets.findSheetForPerson(person.id)
	]);
	return { person, basd: sheet?.basd ?? null, dateOfRank: sheet?.date_of_rank ?? null };
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

/** The header pill hides, rather than fails, for a viewer who cannot see Calendar availability. */
export async function loadAvailabilityToday(
	ctx: Pick<PersonnelDetailContext, 'auth'>,
	person: Personnel,
	asOf: string | Date | undefined,
	listEntries: (input: {
		rangeStart: string;
		rangeEnd: string;
		personnelId: string;
		orderByEndDate: true;
	}) => Promise<PersonnelAvailabilityPeriod[]>,
	listStatusTypes: () => Promise<PersonnelCalendarStatusSnapshot[]>
): Promise<PersonnelAvailabilityToday | null> {
	const decision = await evaluateFeaturePolicy(
		{ auth: ctx.auth },
		POLICY_ACTION_CATALOG.calendar.viewAvailability,
		policyResourceForGroup(person.groupId)
	);
	if (!decision.allowed) return null;
	const today = formatDate(asOfDate(asOf));
	const [entries, statusTypes] = await Promise.all([
		listEntries({ rangeStart: today, rangeEnd: today, personnelId: person.id, orderByEndDate: true }),
		listStatusTypes()
	]);
	const current = entries[0];
	if (!current) return { value: 'Present', detail: 'No active Calendar status for today.', tone: 'good' };
	const statusName = statusTypes.find((status) => status.id === current.statusTypeId)?.name ?? 'Unavailable';
	const note = current.note ? ` ${current.note}` : '';
	return { value: statusName, detail: `${statusName} ${dateRangeDetail(current)}.${note}`, tone: 'watch' };
}

/** Tab badges hide, rather than fail, for a viewer who may manage but not read sensitive records. */
export async function loadPersonnelDetailTabCounts(
	ctx: Pick<PersonnelDetailContext, 'auth'> & { artifactReads: Pick<PersonnelArtifactReadPersistence, 'countRecords'> },
	person: Personnel
): Promise<PersonnelDetailTabCounts | null> {
	const decision = await evaluateFeaturePolicy(
		{ auth: ctx.auth },
		POLICY_ACTION_CATALOG.personnel.readSensitiveRecords,
		policyResourceForGroup(person.groupId)
	);
	if (!decision.allowed) return null;
	const counts = await ctx.artifactReads.countRecords(person.id);
	return { log: counts.openFollowUps, archived: counts.archived };
}
