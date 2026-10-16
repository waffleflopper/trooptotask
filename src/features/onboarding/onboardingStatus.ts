import type { OnboardingStepProgress, OnboardingStepType, PersonnelOnboarding } from './onboarding.types';
import { localDateIn } from '$lib/utils/dates';

/** A paperwork step that has not moved stage in this many whole days is stalled. */
export const STALL_DAYS = 7;

const TYPICAL_WINDOW_DAYS = 90;
const TYPICAL_MIN_PACKETS = 3;
const TOOK_LONG_MARGIN_DAYS = 7;

/**
 * The viewer's calendar day. Packet dates (`startedAt`, `completedAt`) are
 * plain dates and compare as written. `progressChangedAt` is an instant, so
 * it is converted to a calendar date in `timeZone` before counting days.
 */
export interface Today {
	date: string;
	timeZone: string;
}

export type PacketStatus = 'stalled' | 'ready' | 'on_track' | 'new';

export type DetailLine =
	| { kind: 'stage'; stage: string; days: number; stalled: boolean }
	| { kind: 'training' }
	| { kind: 'started_today' }
	| { kind: 'more_open'; count: number }
	| { kind: 'all_done' }
	| { kind: 'none' };

/** Day 1 is the start date. A start date in the future has not begun counting days. */
export type PacketClock = { kind: 'day'; day: number } | { kind: 'starts_in'; days: number };

export interface PacketSummary {
	packet: PersonnelOnboarding;
	status: PacketStatus;
	done: number;
	total: number;
	stalledCount: number;
	/** Days at stage of the longest-stalled step, or 0 when nothing is stalled. */
	stallDays: number;
	/** The step the Soldier is waiting on, or null when every active step is done. */
	focus: OnboardingStepProgress | null;
	detail: DetailLine;
	clock: PacketClock;
}

export interface WaitingStep {
	stepName: string;
	stepType: OnboardingStepType;
	open: number;
	stalled: number;
}

export function todayIn(timeZone: string, now: Date): Today {
	return { date: localDateIn(timeZone, now), timeZone };
}

/** Whole calendar days from one YYYY-MM-DD date to another. */
export function calendarDaysBetween(from: string, to: string): number {
	return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

export function daysAtStage(step: OnboardingStepProgress, today: Today): number {
	const changedOn = localDateIn(today.timeZone, new Date(step.progressChangedAt));
	return Math.max(0, calendarDaysBetween(changedOn, today.date));
}

export function isStepStalled(step: OnboardingStepProgress, today: Today): boolean {
	return (
		step.active &&
		step.stepType === 'paperwork' &&
		!step.completed &&
		step.currentStage !== null &&
		daysAtStage(step, today) >= STALL_DAYS
	);
}

function isOpen(step: OnboardingStepProgress): boolean {
	return step.active && !step.completed;
}

function bySortOrder(a: OnboardingStepProgress, b: OnboardingStepProgress): number {
	return a.sortOrder - b.sortOrder || a.id.localeCompare(b.id);
}

export function summarizePacket(packet: PersonnelOnboarding, today: Today): PacketSummary {
	const open = packet.steps.filter(isOpen).sort(bySortOrder);
	const total = packet.steps.filter((step) => step.active).length;
	const done = total - open.length;

	let longest: OnboardingStepProgress | null = null;
	let stallDays = 0;
	let stalledCount = 0;
	for (const step of open) {
		if (!isStepStalled(step, today)) continue;
		stalledCount++;
		const days = daysAtStage(step, today);
		if (days > stallDays) {
			longest = step;
			stallDays = days;
		}
	}

	const status: PacketStatus =
		stalledCount > 0 ? 'stalled' : open.length === 0 ? 'ready' : done === 0 ? 'new' : 'on_track';
	const focus = longest ?? open[0] ?? null;
	const elapsed = calendarDaysBetween(packet.startedAt, today.date);
	const clock: PacketClock = elapsed < 0 ? { kind: 'starts_in', days: -elapsed } : { kind: 'day', day: elapsed + 1 };

	return {
		packet,
		status,
		done,
		total,
		stalledCount,
		stallDays,
		focus,
		detail: detailLine(focus, open.length, clock, today),
		clock
	};
}

export function clockLabel(clock: PacketClock): string {
	if (clock.kind === 'day') return `Day ${clock.day}`;
	return clock.days === 1 ? 'Starts tomorrow' : `Starts in ${clock.days} days`;
}

function detailLine(
	focus: OnboardingStepProgress | null,
	openCount: number,
	clock: PacketClock,
	today: Today
): DetailLine {
	if (!focus) return { kind: 'all_done' };
	if (focus.stepType === 'paperwork' && focus.currentStage !== null) {
		return {
			kind: 'stage',
			stage: focus.currentStage,
			days: daysAtStage(focus, today),
			stalled: isStepStalled(focus, today)
		};
	}
	if (focus.stepType === 'training') return { kind: 'training' };
	if (clock.kind === 'day' && clock.day === 1) return { kind: 'started_today' };
	return openCount > 1 ? { kind: 'more_open', count: openCount - 1 } : { kind: 'none' };
}

const STATUS_RANK: Record<PacketStatus, number> = { stalled: 0, ready: 1, on_track: 2, new: 3 };

/** Stalled first, longest stall first, then Ready, On track and New; oldest start first within each. */
export function comparePacketSummaries(a: PacketSummary, b: PacketSummary): number {
	return (
		STATUS_RANK[a.status] - STATUS_RANK[b.status] ||
		b.stallDays - a.stallDays ||
		a.packet.startedAt.localeCompare(b.packet.startedAt) ||
		a.packet.id.localeCompare(b.packet.id)
	);
}

/** Soldiers on each open step, grouped by step name across templates, busiest first. */
export function waitingBySteps(packets: readonly PersonnelOnboarding[], today: Today): WaitingStep[] {
	const groups = new Map<string, WaitingStep & { order: number }>();
	for (const packet of packets) {
		const seen = new Map<string, boolean>();
		for (const step of packet.steps) {
			if (!isOpen(step)) continue;
			const stalled = isStepStalled(step, today);
			const group = groups.get(step.stepName);
			if (!group) {
				groups.set(step.stepName, {
					stepName: step.stepName,
					stepType: step.stepType,
					open: 0,
					stalled: 0,
					order: step.sortOrder
				});
			} else {
				group.order = Math.min(group.order, step.sortOrder);
			}
			seen.set(step.stepName, (seen.get(step.stepName) ?? false) || stalled);
		}
		for (const [stepName, stalled] of seen) {
			const group = groups.get(stepName)!;
			group.open++;
			if (stalled) group.stalled++;
		}
	}
	return [...groups.values()]
		.sort(
			(a, b) => b.stalled - a.stalled || b.open - a.open || a.order - b.order || a.stepName.localeCompare(b.stepName)
		)
		.map(({ order: _order, ...step }) => step);
}

type FinishedPacket = Pick<PersonnelOnboarding, 'status' | 'startedAt' | 'completedAt'>;

/** A start date after the completion day counts as finishing the same day. */
export function daysToFinish(packet: { startedAt: string; completedAt: string }): number {
	return Math.max(0, calendarDaysBetween(packet.startedAt, packet.completedAt));
}

/** The first `completed_at` date inside the typical-days window ending on `todayDate`. */
export function typicalWindowStart(todayDate: string): string {
	const start = new Date(`${todayDate}T00:00:00Z`);
	start.setUTCDate(start.getUTCDate() - (TYPICAL_WINDOW_DAYS - 1));
	return start.toISOString().slice(0, 10);
}

/** Exact median days to finish over packets completed in the last 90 days, or null below 3 packets. */
export function typicalDaysToFinish(packets: readonly FinishedPacket[], todayDate: string): number | null {
	const since = typicalWindowStart(todayDate);
	const days = packets
		.filter(
			(packet): packet is FinishedPacket & { completedAt: string } =>
				packet.status === 'completed' &&
				packet.completedAt !== null &&
				packet.completedAt >= since &&
				packet.completedAt <= todayDate
		)
		.map(daysToFinish)
		.sort((a, b) => a - b);
	if (days.length < TYPICAL_MIN_PACKETS) return null;
	const middle = Math.floor(days.length / 2);
	return days.length % 2 === 1 ? days[middle] : (days[middle - 1] + days[middle]) / 2;
}

export function tookLong(days: number, typical: number | null): boolean {
	return typical !== null && days >= typical + TOOK_LONG_MARGIN_DAYS;
}
