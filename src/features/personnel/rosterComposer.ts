import { dueLabel, formatWeekdayDayMonth } from './logModel';
import type { SignalRow } from './rosterSignals';

export type ComposerKind = 'follow-up' | 'note';

export type ComposerEntry =
	| { kind: 'follow-up'; title: string; notes: string; dueDate: string | null }
	| { kind: 'note'; text: string };

export type DuePresetKey = 'tomorrow' | 'friday' | 'week';

export interface DuePreset {
	key: DuePresetKey;
	date: string;
}

const DAY_MS = 86_400_000;
const FRIDAY = 5;

function utcDay(dateOnly: string): Date {
	const [year, month, day] = dateOnly.split('-').map(Number);
	return new Date(Date.UTC(year, month - 1, day));
}

export function addDays(dateOnly: string, days: number): string {
	return new Date(utcDay(dateOnly).getTime() + days * DAY_MS).toISOString().slice(0, 10);
}

export function dueDatePresets(today: string): DuePreset[] {
	const daysToFriday = (FRIDAY - utcDay(today).getUTCDay() + 7) % 7 || 7;
	return [
		{ key: 'tomorrow', date: addDays(today, 1) },
		{ key: 'friday', date: addDays(today, daysToFriday) },
		{ key: 'week', date: addDays(today, 7) }
	];
}

export function selectedPreset(presets: readonly DuePreset[], dueDate: string | null): DuePresetKey | null {
	return presets.find((preset) => preset.date === dueDate)?.key ?? null;
}

export function dueChipLabel(preset: DuePreset): string {
	switch (preset.key) {
		case 'tomorrow':
			return 'Tomorrow';
		case 'friday':
			return formatWeekdayDayMonth(preset.date);
		case 'week':
			return '+1 week';
	}
}

export type AlreadyOpen =
	| { kind: 'pending' }
	| { kind: 'none' }
	| { kind: 'open'; title: string; due: string; overdue: boolean; more: number };

export function alreadyOpenOf(row: SignalRow, today: string): AlreadyOpen {
	if (row.kind === 'pending') return { kind: 'pending' };
	if (row.kind === 'failed') return { kind: 'none' };
	const { openFollowUps } = row.value;
	if (openFollowUps.kind === 'withheld' || !openFollowUps.value.first) return { kind: 'none' };
	const { count, first } = openFollowUps.value;
	return {
		kind: 'open',
		title: first.title,
		due: first.dueDate ? `due ${formatWeekdayDayMonth(first.dueDate)}` : 'no due date',
		overdue: dueLabel(first.dueDate, today).overdue,
		more: count - 1
	};
}
