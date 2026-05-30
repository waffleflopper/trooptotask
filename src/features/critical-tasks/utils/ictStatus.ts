import type {
	CriticalTasksSettings,
	CriticalTasksSettingsInput,
	IctStatus,
	IctStatusInfo,
	IctTask
} from '$features/critical-tasks/criticalTasks.types';
import { addMonthsClamped, formatDate, parseDate } from '$lib/utils/dates';
import { currencyStatus } from '$lib/domain/currencyStatus';

export const DEFAULT_CRITICAL_TASKS_EXPIRATION_MONTHS = 12;
export const DEFAULT_CRITICAL_TASKS_WARNING_DAYS = 60;

function normalizePositiveInteger(value: number | null | undefined, fallback: number): number {
	return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : fallback;
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
	return formatDate(addMonthsClamped(parseDate(completionDate), resolveIctExpirationMonths(task, settings)));
}

const ICT_STATUS_BY_CURRENCY_STATE = {
	'not-recorded': 'not-recorded',
	current: 'current',
	expiring: 'expiring-soon',
	expired: 'expired'
} as const satisfies Record<string, IctStatus>;

/**
 * Critical Task status presenter — a thin adapter over the shared Currency Status core.
 *
 * Critical Tasks resolves its effective expiration date first (per-task override or
 * org default, via `calculateIctExpirationDate`), so the core never has to interpret
 * a null expiration window. This adapter carries no applicability/exemption gate and
 * no color/label presenter — it only maps currency state → IctStatus.
 */
export function getIctStatus(
	completionDate: string | null,
	task: Pick<IctTask, 'expirationMonths'>,
	settings?: CriticalTasksSettingsInput | null,
	asOf?: string | Date
): IctStatusInfo {
	if (!completionDate) {
		return { status: 'not-recorded', expirationDate: null, daysUntilExpiration: null };
	}

	const normalizedSettings = normalizeCriticalTasksSettings(settings);
	const expirationDate = calculateIctExpirationDate(completionDate, task, normalizedSettings);

	const result = currencyStatus(
		{ completionDate, expirationDate },
		{ warnBands: [{ id: 'soon', withinDays: normalizedSettings.expiringSoonWarningDays }] },
		asOf
	);

	return {
		status: ICT_STATUS_BY_CURRENCY_STATE[result.state],
		expirationDate: result.expirationDate,
		daysUntilExpiration: result.daysUntilExpiration
	};
}
