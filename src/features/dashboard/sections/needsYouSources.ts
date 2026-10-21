import { calendarLaneTypes, indexAssignmentsBySlot, openAssignmentDates } from '$features/calendar';
import { clockLabel, summarizePacket } from '$features/onboarding/contracts';
import { evaluateUpcomingLosses, type Personnel } from '$features/personnel/contracts';
import { getRatingDueStatus } from '$features/rating-scheme/contracts';
import { formatDayMonth, formatDayOffset, formatWeekdayDay, parseDate } from '$lib/utils/dates';
import { fromDayNumber, toDayNumber } from '$lib/utils/dayNumber';
import { openCalendarAt } from '../calendarLink';
import { projectTrainingSteps } from '../read-model/dashboardIndexes';
import type { DashboardInputs } from './dashboardInputs';
import type { NeedsYouSource } from './dashboardSections';

const NAMED_LIMIT = 4;

function orgPath(inputs: DashboardInputs): string {
	return `/org/${inputs.page.orgId}`;
}

function peopleById(inputs: DashboardInputs): ReadonlyMap<string, Personnel> {
	return new Map(inputs.personnel.map((person) => [person.id, person]));
}

function fullName(person: Personnel): string {
	return `${person.rank} ${person.lastName}, ${person.firstName}`;
}

function daysBetween(from: string, to: string): number {
	return toDayNumber(to) - toDayNumber(from);
}

function plural(count: number, one: string, many: string): string {
	return `${count} ${count === 1 ? one : many}`;
}

/** "Okafor, Brooks, Liang, Kim" or "Okafor, Brooks, Liang and 3 more". */
function nameList(names: readonly string[]): string {
	if (names.length <= NAMED_LIMIT) return names.join(', ');
	return `${names.slice(0, NAMED_LIMIT - 1).join(', ')} and ${names.length - NAMED_LIMIT + 1} more`;
}

/** "Tue 27, Wed 28 Oct, Mon 2 Nov"; the month follows the last day named in it. */
function dayList(dates: readonly string[]): string {
	const named = dates.length <= NAMED_LIMIT ? dates : dates.slice(0, NAMED_LIMIT - 1);
	const labels = named.map((date, index) => {
		const day = formatWeekdayDay(date);
		const next = named[index + 1];
		return next && next.slice(0, 7) === date.slice(0, 7) ? day : `${day} ${formatDayMonth(date).split(' ')[1]}`;
	});
	const rest = dates.length - named.length;
	return rest > 0 ? `${labels.join(', ')} and ${rest} more` : labels.join(', ');
}

export const overdueEvaluations: NeedsYouSource = (inputs) => {
	const people = peopleById(inputs);
	const today = parseDate(inputs.today);
	return inputs.page.dashboard.data.ratingSchemeEntries.flatMap((entry) => {
		const person = people.get(entry.ratedPersonId);
		if (!person || getRatingDueStatus(entry.ratingPeriodEnd, entry.status, today) !== 'overdue') return [];
		const daysLate = daysBetween(entry.ratingPeriodEnd, inputs.today);
		return [
			{
				kind: 'overdue' as const,
				id: `overdue:${entry.id}`,
				ratingSchemeEntryId: entry.id,
				title: `${entry.evalType} for ${fullName(person)}`,
				subtitle: `Thru date ${formatDayMonth(entry.ratingPeriodEnd)}`,
				timing: `${plural(daysLate, 'day', 'days')} late`,
				href: `${orgPath(inputs)}/evals?${new URLSearchParams({ entry: entry.id })}`,
				action: null,
				urgency: { daysLate }
			}
		];
	});
};

export const expiredTraining: NeedsYouSource = (inputs) => {
	const summary = inputs.page.trainingSummary;
	if (!summary) return [];
	const people = peopleById(inputs);
	const typeNames = new Map(inputs.page.dashboard.data.trainingTypes.map((type) => [type.id, type.name]));
	return summary.expiredByType.flatMap((expired) => {
		const expiredPeople = expired.personnelIds.flatMap((id) => people.get(id) ?? []);
		if (expiredPeople.length === 0) return [];
		return {
			kind: 'expired' as const,
			id: `expired:${expired.trainingTypeId}`,
			trainingTypeId: expired.trainingTypeId,
			personnelIds: expiredPeople.map((person) => person.id),
			title: `${plural(expiredPeople.length, 'Soldier', 'Soldiers')} expired on ${typeNames.get(expired.trainingTypeId) ?? 'a removed training type'}`,
			subtitle: nameList(expiredPeople.map((person) => person.lastName)),
			timing: `since ${formatDayMonth(fromDayNumber(toDayNumber(inputs.today) - expired.maxDaysLate))}`,
			href: `${orgPath(inputs)}/training/reports?${new URLSearchParams({ types: expired.trainingTypeId })}`,
			action: null,
			urgency: { daysLate: expired.maxDaysLate }
		};
	});
};

export const unfilledDuty: NeedsYouSource = (inputs) => {
	const slots = indexAssignmentsBySlot(inputs.assignments);
	return calendarLaneTypes(inputs.assignmentTypes).flatMap((type) => {
		const openDates = openAssignmentDates(slots, type.id, inputs.forecastDays);
		if (openDates.length === 0) return [];
		return [
			{
				kind: 'unfilled' as const,
				id: `unfilled:${type.id}`,
				assignmentTypeId: type.id,
				openDates,
				title: `${plural(openDates.length, `${type.name} day`, `${type.name} days`)} unfilled`,
				subtitle: dayList(openDates),
				timing: formatDayOffset(daysBetween(inputs.today, openDates[0])),
				href: `${orgPath(inputs)}/calendar`,
				onOpen: () => openCalendarAt(openDates[0]),
				action: null,
				urgency: { date: openDates[0] }
			}
		];
	});
};

export const stalledOnboarding: NeedsYouSource = (inputs) => {
	const people = peopleById(inputs);
	const today = { date: inputs.today, timeZone: inputs.timeZone };
	const project = projectTrainingSteps(inputs.page);
	return inputs.page.dashboard.data.activeOnboardings.flatMap((packet) => {
		const person = people.get(packet.personnelId);
		const summary = summarizePacket(project(packet), today);
		if (!person || summary.status !== 'stalled' || !summary.focus) return [];
		return [
			{
				kind: 'stalled' as const,
				id: `stalled:${packet.id}`,
				onboardingId: packet.id,
				stepId: summary.focus.id,
				title: `${fullName(person)} · onboarding`,
				subtitle: `${summary.focus.stepName} · waiting ${plural(summary.stallDays, 'day', 'days')} · ${summary.done} of ${summary.total}`,
				timing: clockLabel(summary.clock).toLowerCase(),
				href: `${orgPath(inputs)}/onboarding?${new URLSearchParams({ packet: packet.id })}`,
				action: null,
				urgency: { date: fromDayNumber(toDayNumber(inputs.today) - summary.stallDays) }
			}
		];
	});
};

const LOSS_LABEL = { ETS: 'ETS', 'PCS / DEROS': 'PCS' } as const;

export const leavingWithoutAward: NeedsYouSource = (inputs) => {
	const people = peopleById(inputs);
	const data = inputs.page.dashboard.data;
	return evaluateUpcomingLosses(inputs.personnel, data.lossWarningWindowDays, inputs.today, {
		awardTrackingAcknowledgedPersonnelIds: data.awardTrackingAcknowledgedPersonnelIds
	}).flatMap((loss) => {
		const person = people.get(loss.personId);
		if (!loss.awardDueSoon || !person) return [];
		return [
			{
				kind: 'leaving' as const,
				id: `leaving:${person.id}`,
				personnelId: person.id,
				title: `${fullName(person)} ${LOSS_LABEL[loss.triggerType]} ${formatDayMonth(loss.targetDate)}`,
				subtitle: 'End-of-tour award not started',
				timing: formatDayOffset(loss.daysRemaining),
				href: `${orgPath(inputs)}/personnel/${person.slug ?? person.id}/data-sheet`,
				action: null,
				urgency: { date: loss.targetDate }
			}
		];
	});
};
