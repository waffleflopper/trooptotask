import { POLICY_ACTION_CATALOG, type FeatureLanePolicyAction } from '$lib/access/policyEvaluator';
import type { UseCaseContext } from '$lib/server/core/ports';
import { fail } from '$lib/server/core/errors';
import type { AvailabilityEntry, Personnel, StatusType } from '$lib/types';
import type { TrainingType, PersonnelTraining } from '$features/training/training.types';
import type { PersonnelReadinessLane } from '$features/personnel/personnel-detail.types';
import { PersonnelEntity } from '$lib/server/entities/personnel';
import { StatusTypeEntity } from '$lib/server/entities/statusType';
import { TrainingTypeEntity } from '$lib/server/entities/trainingType';
import { PersonnelTrainingEntity } from '$lib/server/entities/personnelTraining';
import { IctTaskEntity } from '$lib/server/entities/ictTask';
import { PersonnelIctCompletionEntity } from '$lib/server/entities/personnelIctCompletion';
import { RatingSchemeEntryEntity } from '$lib/server/entities/ratingSchemeEntry';
import { formatDate, formatDisplayDate, parseDate } from '$lib/utils/dates';
import { isTrainingApplicable } from '$features/training/utils/applicability';
import { buildCriticalTasksSoldierReadinessSummary } from '$features/critical-tasks/utils/ictReadinessSnapshot';
import { policyResourceForGroup, requireFeaturePolicy } from './featurePolicy';

interface PersonnelPolicyRow extends Record<string, unknown> {
	id: string;
	group_id: string | null;
}

interface OrgSettingsRow {
	critical_tasks_default_expiration_months?: number | null;
	critical_tasks_expiring_soon_warning_days?: number | null;
	loss_warning_window_days?: number | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;

async function loadPersonnelForLane(
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

function plural(count: number, singular: string, pluralLabel = `${singular}s`): string {
	return `${count} ${count === 1 ? singular : pluralLabel}`;
}

function sentenceList(items: string[], fallback: string): string {
	return items.length > 0 ? `${items.join('. ')}.` : fallback;
}

function formatDueLabel(name: string, expirationDate: string | null, today: Date): string {
	if (!expirationDate) return `${name} not completed`;
	const days = daysBetween(today, parseDate(expirationDate));
	if (days < 0) return `${name} expired ${Math.abs(days)}d ago`;
	if (days === 0) return `${name} due today`;
	return `${name} ${days}d left`;
}

function dateRangeDetail(entry: AvailabilityEntry): string {
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
	) => Promise<AvailabilityEntry[]>
): Promise<PersonnelReadinessLane> {
	await loadPersonnelForLane(ctx, personnelId, POLICY_ACTION_CATALOG.calendar.viewAvailability, 'availability');
	const today = formatDate(asOfDate(asOf));
	const [entries, statusRows] = await Promise.all([
		listEntries(ctx, {
			rangeStart: today,
			rangeEnd: today,
			personnelId,
			orderByEndDate: true
		}),
		ctx.store.findMany<Record<string, unknown>>('status_types', ctx.auth.orgId, undefined, {
			select: StatusTypeEntity.select
		})
	]);
	const statusById = new Map(StatusTypeEntity.fromDbArray(statusRows).map((status) => [status.id, status]));
	const current = entries[0];
	if (!current) {
		return {
			label: 'Availability',
			value: 'Present',
			detail: 'No active Calendar status for today.',
			tone: 'good'
		};
	}

	const status: StatusType | undefined = statusById.get(current.statusTypeId);
	const statusName = status?.name ?? 'Unavailable';
	const note = current.note ? ` ${current.note}` : '';
	return {
		label: 'Availability',
		value: statusName,
		detail: `${statusName} ${dateRangeDetail(current)}.${note}`,
		tone: 'watch'
	};
}

export async function loadTrainingReadinessLane(
	ctx: UseCaseContext,
	personnelId: string,
	asOf?: string | Date
): Promise<PersonnelReadinessLane> {
	const person = await loadPersonnelForLane(
		ctx,
		personnelId,
		POLICY_ACTION_CATALOG.training.viewRecords,
		'training_record'
	);
	const today = asOfDate(asOf);
	const [typeRows, trainingRows] = await Promise.all([
		ctx.store.findMany<Record<string, unknown>>('training_types', ctx.auth.orgId, undefined, {
			select: TrainingTypeEntity.select,
			orderBy: [{ column: 'sort_order', ascending: true }]
		}),
		ctx.store.findMany<Record<string, unknown>>(
			'personnel_trainings',
			ctx.auth.orgId,
			{ personnel_id: personnelId },
			{
				select: PersonnelTrainingEntity.select
			}
		)
	]);
	const types = TrainingTypeEntity.fromDbArray(typeRows);
	const trainings = PersonnelTrainingEntity.fromDbArray(trainingRows);
	const trainingByType = new Map(trainings.map((training) => [training.trainingTypeId, training]));
	const issues = types
		.filter((type) => isRequiredTrainingForPerson(type, person))
		.map((type) => trainingIssueForType(type, trainingByType.get(type.id), today))
		.filter((issue): issue is { name: string; expired: boolean; label: string } => Boolean(issue));

	if (issues.length === 0) {
		return {
			label: 'Training',
			value: 'Current',
			detail: 'No due or overdue Training requirements.',
			tone: 'good'
		};
	}

	return {
		label: 'Training',
		value: `${issues.length} due`,
		detail: sentenceList(
			issues.slice(0, 2).map((issue) => issue.label),
			'Training requirements need attention.'
		),
		tone: issues.some((issue) => issue.expired) ? 'bad' : 'watch'
	};
}

function isRequiredTrainingForPerson(type: TrainingType, person: Personnel): boolean {
	if (type.canBeExempted && type.exemptPersonnelIds.includes(person.id)) return false;
	return isTrainingApplicable(type, person);
}

function trainingIssueForType(type: TrainingType, training: PersonnelTraining | undefined, today: Date) {
	if (!training) {
		return { name: type.name, expired: true, label: `${type.name} not completed` };
	}
	if (!training.expirationDate) return null;

	const days = daysBetween(today, parseDate(training.expirationDate));
	if (days > type.warningDaysYellow) return null;

	return {
		name: type.name,
		expired: days < 0,
		label: formatDueLabel(type.name, training.expirationDate, today)
	};
}

export async function loadCriticalTasksReadinessLane(
	ctx: UseCaseContext,
	personnelId: string,
	asOf?: string | Date
): Promise<PersonnelReadinessLane> {
	const person = await loadPersonnelForLane(
		ctx,
		personnelId,
		POLICY_ACTION_CATALOG.criticalTasks.viewReadiness,
		'personnel_ict_completion'
	);
	const [taskRows, completionRows, settingsRow] = await Promise.all([
		ctx.store.findMany<Record<string, unknown>>('ict_tasks', ctx.auth.orgId, undefined, {
			select: IctTaskEntity.select,
			isNull: { archived_at: true },
			orderBy: [
				{ column: 'sort_order', ascending: true },
				{ column: 'task_code', ascending: true }
			]
		}),
		ctx.store.findMany<Record<string, unknown>>(
			'personnel_ict_completions',
			ctx.auth.orgId,
			{ personnel_id: personnelId },
			{ select: PersonnelIctCompletionEntity.select }
		),
		ctx.store.findOne<OrgSettingsRow>(
			'organizations',
			ctx.auth.orgId,
			{ id: ctx.auth.orgId },
			'critical_tasks_default_expiration_months, critical_tasks_expiring_soon_warning_days'
		)
	]);
	const tasks = IctTaskEntity.fromDbArray(taskRows);
	const completions = PersonnelIctCompletionEntity.fromDbArray(completionRows);
	const readiness = buildCriticalTasksSoldierReadinessSummary({
		person,
		activeTasks: tasks,
		completions,
		settings: {
			defaultExpirationMonths: settingsRow?.critical_tasks_default_expiration_months ?? null,
			expiringSoonWarningDays: settingsRow?.critical_tasks_expiring_soon_warning_days ?? null
		},
		asOf
	});

	if (readiness.applicableCount === 0) {
		return {
			label: 'Critical Tasks',
			value: 'No tasks',
			detail: 'No applicable ICT tasks for this Soldier.',
			tone: 'neutral'
		};
	}

	const expiringSoonDetail =
		readiness.expiringSoonCount > 0 ? ` ${plural(readiness.expiringSoonCount, 'task')} expiring soon.` : '';
	const attentionDetail =
		readiness.attentionCount > 0
			? ` ${plural(readiness.attentionCount, 'task')} ${readiness.attentionCount === 1 ? 'needs' : 'need'} attention.`
			: ' No tasks need attention.';
	const tone =
		readiness.readinessPercent < 70
			? 'bad'
			: readiness.readinessPercent < 90 || readiness.expiringSoonCount > 0
				? 'watch'
				: 'good';

	return {
		label: 'Critical Tasks',
		value: `${readiness.readinessPercent}%`,
		detail: `${readiness.readyCount} of ${readiness.applicableCount} applicable ICT tasks ready.${expiringSoonDetail}${attentionDetail}`,
		tone
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
