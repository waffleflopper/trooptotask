import type {
	CriticalTasksSettings,
	CriticalTasksSettingsInput,
	IctStatusInfo,
	IctTask
} from '$features/critical-tasks/criticalTasks.types';
import { addMonths, formatDate, parseDate } from '$lib/utils/dates';

export const DEFAULT_CRITICAL_TASKS_EXPIRATION_MONTHS = 12;
export const DEFAULT_CRITICAL_TASKS_WARNING_DAYS = 60;

function normalizePositiveInteger(value: number | null | undefined, fallback: number): number {
	return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : fallback;
}

function toStartOfDay(date: Date): Date {
	const normalized = new Date(date);
	normalized.setHours(0, 0, 0, 0);
	return normalized;
}

function resolveAsOfDate(asOf: string | Date | undefined): Date {
	if (!asOf) return toStartOfDay(new Date());
	return toStartOfDay(typeof asOf === 'string' ? parseDate(asOf) : asOf);
}

export function normalizeCriticalTasksSettings(settings?: CriticalTasksSettingsInput | null): CriticalTasksSettings {
	return {
		defaultExpirationMonths: normalizePositiveInteger(
			settings?.defaultExpirationMonths,
			DEFAULT_CRITICAL_TASKS_EXPIRATION_MONTHS
		),
		expiringSoonWarningDays: normalizePositiveInteger(
			settings?.expiringSoonWarningDays,
			DEFAULT_CRITICAL_TASKS_WARNING_DAYS
		)
	};
}

export function resolveIctExpirationMonths(
	task: Pick<IctTask, 'expirationMonths'>,
	settings?: CriticalTasksSettingsInput | null
): number {
	return task.expirationMonths ?? normalizeCriticalTasksSettings(settings).defaultExpirationMonths;
}

export function calculateIctExpirationDate(
	completionDate: string | null,
	task: Pick<IctTask, 'expirationMonths'>,
	settings?: CriticalTasksSettingsInput | null
): string | null {
	if (!completionDate) return null;
	return formatDate(addMonths(parseDate(completionDate), resolveIctExpirationMonths(task, settings)));
}

export function getIctStatus(
	completionDate: string | null,
	task: Pick<IctTask, 'expirationMonths'>,
	settings?: CriticalTasksSettingsInput | null,
	asOf?: string | Date
): IctStatusInfo {
	if (!completionDate) {
		return {
			status: 'not-recorded',
			expirationDate: null,
			daysUntilExpiration: null
		};
	}

	const normalizedSettings = normalizeCriticalTasksSettings(settings);
	const expirationDate = calculateIctExpirationDate(completionDate, task, normalizedSettings);
	if (!expirationDate) {
		return {
			status: 'not-recorded',
			expirationDate: null,
			daysUntilExpiration: null
		};
	}

	const dayMs = 1000 * 60 * 60 * 24;
	const daysUntilExpiration = Math.floor(
		(toStartOfDay(parseDate(expirationDate)).getTime() - resolveAsOfDate(asOf).getTime()) / dayMs
	);

	if (daysUntilExpiration < 0) {
		return {
			status: 'expired',
			expirationDate,
			daysUntilExpiration
		};
	}

	if (daysUntilExpiration < normalizedSettings.expiringSoonWarningDays) {
		return {
			status: 'expiring-soon',
			expirationDate,
			daysUntilExpiration
		};
	}

	return {
		status: 'current',
		expirationDate,
		daysUntilExpiration
	};
}
