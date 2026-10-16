import { localDateIn } from '$lib/utils/dates';
import type { OnboardingStepProgress, PersonnelOnboarding } from './onboarding.types';
import { getProgress } from './onboardingProgress';
import { calendarDaysBetween, tookLong, typicalDaysToFinish, typicalWindowStart } from './onboardingStatus';

export type HistoryOutcome = 'completed' | 'cancelled';
export type OutcomeFilter = 'all' | HistoryOutcome;

/** The "All groups" and "All templates" choice. */
export const HISTORY_ALL = 'all';

/** One finished packet with what the table shows about it. */
export interface HistoryRow {
	packet: PersonnelOnboarding;
	outcome: HistoryOutcome;
	/** `completed_at` for a completed packet, the viewer's local date of `cancelled_at` for a cancelled one. */
	finishedOn: string;
	/** Whole calendar days from the start date to the finish date. */
	days: number;
	tookLong: boolean;
	done: number;
	total: number;
}

/** Figures for the page header. They ignore the search and filters. */
export interface HistoryOverview {
	/** Finished in the last 90 days, whatever the outcome. */
	finished: number;
	/** Of those, how many were cancelled. */
	cancelled: number;
	typicalDays: number | null;
}

export interface History {
	/** Most recently finished first, by the full cancellation time where there is one. */
	rows: HistoryRow[];
	overview: HistoryOverview;
}

export interface HistoryFilters {
	outcome: OutcomeFilter;
	query: string;
	groupId: string;
	templateId: string;
}

export interface HistoryPerson {
	name: string;
	rank: string;
	mos: string;
	groupId: string | null;
}

/** A step as the packet ended: done or open, with the paperwork stage it reached. */
export interface FinalStep {
	id: string;
	name: string;
	done: boolean;
	/** Dropped from the template after the packet started. */
	removed: boolean;
	stage: string | null;
}

export interface HistoryNote {
	stepName: string;
	userId: string;
	timestamp: string;
	text: string;
}

/** When the outcome was recorded: the cancellation time, or the completion date, which has no time of day. */
function finishedAt(packet: PersonnelOnboarding): string {
	return (packet.status === 'cancelled' ? packet.cancelledAt : packet.completedAt) ?? packet.startedAt;
}

/** Within one finish day a cancellation has a time and a completion only a date, so cancellations list first, latest first. */
function compareSameDay(a: PersonnelOnboarding, b: PersonnelOnboarding): number {
	const outcome = Number(b.status === 'cancelled') - Number(a.status === 'cancelled');
	if (outcome !== 0) return outcome;
	const aTime = a.cancelledAt ? Date.parse(a.cancelledAt) : 0;
	const bTime = b.cancelledAt ? Date.parse(b.cancelledAt) : 0;
	return bTime - aTime;
}

function finishedOn(packet: PersonnelOnboarding, timeZone: string): string {
	const finish = finishedAt(packet);
	return packet.status === 'cancelled' && packet.cancelledAt !== null
		? localDateIn(timeZone, new Date(finish))
		: finish;
}

function isFinished(packet: PersonnelOnboarding): packet is PersonnelOnboarding & { status: HistoryOutcome } {
	return packet.status === 'completed' || packet.status === 'cancelled';
}

/** Builds the table rows and header figures from every finished packet, newest first. `todayDate` is the viewer's date in `timeZone`. */
export function buildHistory(packets: readonly PersonnelOnboarding[], todayDate: string, timeZone: string): History {
	const typicalDays = typicalDaysToFinish(packets, todayDate);
	const since = typicalWindowStart(todayDate);

	const rows = packets
		.filter(isFinished)
		.map((packet): HistoryRow => {
			const finished = finishedOn(packet, timeZone);
			const days = Math.max(0, calendarDaysBetween(packet.startedAt, finished));
			const { completed, total } = getProgress(packet);
			return {
				packet,
				outcome: packet.status,
				finishedOn: finished,
				days,
				tookLong: tookLong(days, typicalDays),
				done: completed,
				total
			};
		})
		.sort(
			(a, b) =>
				b.finishedOn.localeCompare(a.finishedOn) ||
				compareSameDay(a.packet, b.packet) ||
				a.packet.id.localeCompare(b.packet.id)
		);

	const recent = rows.filter((row) => row.finishedOn >= since && row.finishedOn <= todayDate);
	return {
		rows,
		overview: {
			finished: recent.length,
			cancelled: recent.filter((row) => row.outcome === 'cancelled').length,
			typicalDays
		}
	};
}

export function filterHistoryRows(
	rows: readonly HistoryRow[],
	filters: HistoryFilters,
	personOf: (personnelId: string) => HistoryPerson | undefined
): HistoryRow[] {
	const query = filters.query.trim().toLowerCase();
	return rows.filter((row) => {
		if (filters.outcome !== 'all' && row.outcome !== filters.outcome) return false;
		if (filters.templateId !== HISTORY_ALL && row.packet.templateId !== filters.templateId) return false;
		const person = personOf(row.packet.personnelId);
		if (filters.groupId !== HISTORY_ALL && person?.groupId !== filters.groupId) return false;
		if (!query) return true;
		return [person?.name, person?.rank, person?.mos].some((field) => field?.toLowerCase().includes(query));
	});
}

/** The header parts that have something to say: "18 finished in the last 90 days", the typical figure, "2 cancelled". */
export function historySubtitleParts({ finished, cancelled, typicalDays }: HistoryOverview): string[] {
	const parts: string[] = [];
	if (finished > 0) parts.push(`${finished} finished in the last 90 days`);
	if (typicalDays !== null) parts.push(`Typically ${Math.round(typicalDays)} days to finish`);
	if (cancelled > 0) parts.push(`${cancelled} cancelled`);
	return parts;
}

function byPacketOrder(a: OnboardingStepProgress, b: OnboardingStepProgress): number {
	return a.sortOrder - b.sortOrder || a.id.localeCompare(b.id);
}

/** Every step of the packet in order, with steps that left the template after the others. */
export function finalSteps(packet: PersonnelOnboarding): FinalStep[] {
	const toFinal = (step: OnboardingStepProgress): FinalStep => ({
		id: step.id,
		name: step.stepName,
		done: step.completed,
		removed: !step.active,
		stage: step.stepType === 'paperwork' ? step.currentStage : null
	});
	return [
		...packet.steps.filter((step) => step.active).sort(byPacketOrder),
		...packet.steps.filter((step) => !step.active).sort(byPacketOrder)
	].map(toFinal);
}

/** Every note on the packet, oldest first. */
export function packetNotes(packet: PersonnelOnboarding): HistoryNote[] {
	return packet.steps
		.flatMap((step) => step.notes.map((note) => ({ stepName: step.stepName, ...note })))
		.sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "1 Sep", with the year when it is not the current one. Both arguments are YYYY-MM-DD. */
export function formatHistoryDate(date: string, todayDate: string): string {
	const [year, month, day] = date.split('-').map(Number);
	const label = `${day} ${MONTHS[month - 1]}`;
	return year === Number(todayDate.slice(0, 4)) ? label : `${label} ${year}`;
}
