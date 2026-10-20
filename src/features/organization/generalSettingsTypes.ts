import type { UnitCounts } from './unitCounts';

export interface GeneralSettingsOrganization {
	id: string;
	name: string | null;
	urlSlug: string | null;
	urlSegment: string;
}

export interface LastRenamed {
	at: string;
	actor: string | null;
}

export const CALENDAR_COUNT_KEYS = ['statusTypes', 'assignmentTypes', 'specialDays'] as const;

export type CalendarCounts = UnitCounts<(typeof CALENDAR_COUNT_KEYS)[number]>;

export interface GeneralSettingsData {
	organization: GeneralSettingsOrganization;
	/** Null for a member who cannot read the audit log, so the slot stays empty and the read never runs. */
	lastRenamed: Promise<LastRenamed | null> | null;
	calendarCounts: Promise<CalendarCounts>;
}

export type GeneralSettingsActionData = {
	[key: string]: unknown;
	nameSuccess?: boolean;
	error?: string;
	slugError?: string;
} | null;
