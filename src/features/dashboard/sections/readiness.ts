import { evaluateUpcomingLosses } from '$features/personnel/contracts';
import { getRatingDueStatus } from '$features/rating-scheme/contracts';
import { trainingReadinessBand, type BriefingBand } from '$features/training/contracts';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { formatDayMonth, parseDate } from '$lib/utils/dates';
import type { DashboardInputs } from './dashboardInputs';
import type { ReadinessSource, ReadinessTone } from './dashboardSections';
import { LOSS_LABEL, orgPath, plural } from './needsYouSources';
import { hasOnboardingTemplate } from './setupChecks';

const { criticalTasks, onboarding, ratingScheme, training } = POLICY_ACTION_CATALOG;
const NAMED_LOSSES = 3;

/** The bands Training reports color by, read as the Dashboard's three tones. */
const TONE_BY_BAND = {
	goal: 'good',
	near: 'warning',
	below: 'warning',
	far: 'critical',
	critical: 'critical',
	none: 'good'
} as const satisfies Record<BriefingBand, ReadinessTone>;

function percentOf(part: number, whole: number): number {
	return whole === 0 ? 100 : Math.max(0, Math.round((part / whole) * 100));
}

/** Person-based currency: a Person with any expired, missing or orange-warning requirement is not current. */
export const trainingReadiness: ReadinessSource = (inputs, access) => {
	const summary = inputs.page.trainingSummary;
	const column = {
		id: 'training',
		title: 'Training',
		link: { label: 'Training reports', href: `${orgPath(inputs)}/training/reports` }
	};
	if (!summary) {
		return inputs.page.summaryFailed && access.can(training.viewRecords)
			? { ...column, state: 'failed', subject: 'Training currency' }
			: null;
	}

	const total = inputs.personnel.length;
	const delinquentByGroup = new Map(
		summary.groupDelinquencies.map((group) => [group.groupId, group.delinquentPersonnelCount])
	);
	const delinquent = summary.groupDelinquencies.reduce((sum, group) => sum + group.delinquentPersonnelCount, 0);
	const expired = summary.expiredPersonnelCount;
	const missing = summary.missingPersonnelCount;
	const expiring = delinquent - expired - missing;
	const current = Math.max(0, total - delinquent);
	const currentPercent = percentOf(current, total);
	const goal = inputs.page.dashboard.data.trainingReadinessGoalPercent;

	const sentences: string[] = [];
	const counts = [
		{ count: expired, label: 'expired' },
		{ count: missing, label: 'missing training' },
		{ count: expiring, label: 'expiring' }
	]
		.filter(({ count }) => count > 0)
		.map(({ count, label }, index) =>
			index === 0 ? `${plural(count, 'Soldier', 'Soldiers')} ${label}` : `${count} ${label}`
		);
	const last = counts.pop();
	if (!last) sentences.push('Everyone is current.');
	else sentences.push(counts.length > 0 ? `${counts.join(', ')} and ${last}.` : `${last}.`);
	const lowest = lowestGroupCurrency(inputs, delinquentByGroup);
	if (lowest && lowest.percent < 100) sentences.push(`${lowest.name} is lowest at ${lowest.percent}%.`);
	sentences.push(`Goal ${goal}%. Any training expired, missing or in its Expiring window makes a Soldier not current.`);

	return {
		...column,
		state: 'ready',
		figure: `${currentPercent}%`,
		figureTone: TONE_BY_BAND[trainingReadinessBand(current, total, goal)],
		suffix: 'of Soldiers current',
		graphic: {
			kind: 'shares',
			shares: [
				{ label: 'current', count: current, tone: 'good' },
				{ label: 'expiring', count: expiring, tone: 'warning' },
				{ label: 'missing training', count: missing, tone: 'critical' },
				{ label: 'expired', count: expired, tone: 'critical' }
			]
		},
		note: sentences.join(' ')
	};
};

/** The Group with the lowest currency, among two or more Groups that have People. */
function lowestGroupCurrency(
	inputs: DashboardInputs,
	delinquentByGroup: ReadonlyMap<string | null, number>
): { name: string; percent: number } | null {
	const headcount = new Map<string, number>();
	for (const person of inputs.personnel) {
		if (person.groupId) headcount.set(person.groupId, (headcount.get(person.groupId) ?? 0) + 1);
	}
	const staffed = inputs.groups
		.filter((group) => headcount.has(group.id))
		.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name))
		.map((group) => {
			const total = headcount.get(group.id)!;
			return { name: group.name, percent: percentOf(total - (delinquentByGroup.get(group.id) ?? 0), total) };
		});
	if (staffed.length < 2) return null;
	return staffed.reduce((lowest, group) => (group.percent < lowest.percent ? group : lowest));
}

/**
 * Readiness is per task and Soldier; the bar is per Soldier so its shares add up: below the threshold,
 * at risk (at or above it with a task expiring soon), and ready (everyone else with an applicable task).
 */
export const criticalTasksReadiness: ReadinessSource = (inputs, access) => {
	const summary = inputs.page.ictlSummary;
	const column = {
		id: 'critical-tasks',
		title: 'Critical tasks',
		link: { label: 'Critical tasks', href: `${orgPath(inputs)}/critical-tasks` }
	};
	if (!summary) {
		return inputs.page.summaryFailed && access.can(criticalTasks.viewReadiness)
			? { ...column, state: 'failed', subject: 'Critical Tasks readiness' }
			: null;
	}

	const total = summary.soldiersBelowThresholdTotal;
	const below = summary.soldiersBelowThresholdCount;
	const atRisk = summary.soldiersAtRiskCount;
	const lapsing = `${plural(summary.expiringSoonCount, 'task lapses', 'tasks lapse')} within ${summary.expiringSoonWindowDays} days.`;

	return {
		...column,
		state: 'ready',
		figure: `${summary.overallReadinessPercent}%`,
		suffix: 'ready',
		trend: summary.overallDeltaPercent,
		graphic: {
			kind: 'shares',
			shares: [
				{ label: 'ready', count: total - below - atRisk, tone: 'good' },
				{ label: 'at risk', count: atRisk, tone: 'warning' },
				{ label: `below ${summary.thresholdPercent}%`, count: below, tone: 'critical' }
			]
		},
		note:
			total === 0
				? 'No Soldier has an applicable task yet.'
				: `${below} of ${total} Soldiers below the ${summary.thresholdPercent}% threshold; ${lapsing}`
	};
};

export const evaluationsReadiness: ReadinessSource = (inputs, access) => {
	if (!access.can(ratingScheme.viewEntries)) return null;

	const counts = { overdue: 0, 'due-30': 0, 'due-60': 0, current: 0 };
	const today = parseDate(inputs.today);
	for (const entry of inputs.page.dashboard.data.ratingSchemeEntries) {
		const status = getRatingDueStatus(entry.ratingPeriodEnd, entry.status, today);
		if (status !== 'completed') counts[status]++;
	}
	const { overdue } = counts;
	const due30 = counts['due-30'];
	const due60 = counts['due-60'];
	const { current } = counts;
	const due =
		due30 + due60 === 0
			? 'None thru within 60 days.'
			: `${due30}${overdue > 0 ? ' more' : ''} thru in 30 days and ${due60} in 31 to 60.`;

	return {
		id: 'evaluations',
		title: 'Evaluations',
		link: { label: 'Evals', href: `${orgPath(inputs)}/evals` },
		state: 'ready',
		figure: String(overdue),
		figureTone: overdue > 0 ? 'critical' : undefined,
		suffix: 'past thru',
		graphic: {
			kind: 'shares',
			shares: [
				{ label: 'past thru', count: overdue, tone: 'critical' },
				{ label: 'thru in 30 days', count: due30, tone: 'warning' },
				{ label: 'thru in 31 to 60 days', count: due60, tone: 'warning' },
				{ label: 'current', count: current, tone: 'good' }
			]
		},
		note: `${due} ${current} current.`
	};
};

export const arrivingAndLeavingReadiness: ReadinessSource = (inputs, access) => {
	const data = inputs.page.dashboard.data;
	const windowDays = data.lossWarningWindowDays;
	const losses = evaluateUpcomingLosses(inputs.personnel, windowDays, inputs.today);
	const seesOnboarding = access.can(onboarding.viewWorkflows) && hasOnboardingTemplate(inputs);

	const named = losses
		.slice(0, NAMED_LOSSES)
		.map((loss) => `${loss.lastName} ${LOSS_LABEL[loss.triggerType]} ${formatDayMonth(loss.targetDate)}`);
	const rest = losses.length - named.length;
	const sentences = [
		losses.length === 0
			? `No one leaves in the next ${windowDays} days.`
			: `${named.join(', ')}${rest > 0 ? ` and ${rest} more` : ''}.`
	];
	if (seesOnboarding) {
		const inScope = new Set(inputs.personnel.map((person) => person.id));
		const arriving = data.activeOnboardings.filter((packet) => inScope.has(packet.personnelId)).length;
		sentences.push(
			arriving === 0 ? 'No one in onboarding.' : `${plural(arriving, 'Soldier', 'Soldiers')} in onboarding.`
		);
	}

	return {
		id: 'arriving-and-leaving',
		title: 'Arriving and leaving',
		link: seesOnboarding
			? { label: 'Onboarding', href: `${orgPath(inputs)}/onboarding` }
			: { label: 'Personnel', href: `${orgPath(inputs)}/personnel` },
		state: 'ready',
		figure: String(losses.length),
		suffix: `leaving in ${windowDays} days`,
		graphic: {
			kind: 'timeline',
			ticks: losses.map((loss) => ({
				id: loss.personId,
				offsetPercent: windowDays === 0 ? 0 : (loss.daysRemaining * 100) / windowDays
			}))
		},
		note: sentences.join(' ')
	};
};
