import type { Personnel } from '$lib/types';
import type { TrainingType, PersonnelTraining, TrainingStatus } from '$features/training/training.types';
import { TRAINING_STATUS_COLORS } from '$features/training/training.types';
import { addMonthsClamped, formatDate, parseDate } from '$lib/utils/dates';
import { currencyStatus } from '$lib/domain/currencyStatus';
import { isTrainingApplicable } from './applicability';

export const TRAINING_STATUS_SORT_ORDER: Record<TrainingStatus, number> = {
	expired: 0,
	'warning-orange': 1,
	'warning-yellow': 2,
	'not-completed': 3,
	current: 4,
	'not-required': 5,
	exempt: 6
};

export interface TrainingStatusInfo {
	status: TrainingStatus;
	color: string;
	label: string;
	daysUntilExpiration: number | null;
}

export function calculateExpirationDate(completionDate: string | null, expirationMonths: number | null): string | null {
	if (expirationMonths === null || !completionDate) return null;
	// addMonthsClamped pins month-end overflow (e.g. Jan 31 + 1mo → Feb 28, not Mar 3).
	return formatDate(addMonthsClamped(parseDate(completionDate), expirationMonths));
}

function present(status: TrainingStatus, label: string, daysUntilExpiration: number | null): TrainingStatusInfo {
	return { status, color: TRAINING_STATUS_COLORS[status], label, daysUntilExpiration };
}

/**
 * Training status presenter — a thin adapter over the shared Currency Status core.
 *
 * The Training-only concerns stay here, on either side of the core:
 *   - BEFORE: exemption, applicability (N/A), and the never-expires shortcut.
 *   - AFTER: mapping currency state → TrainingStatus union + color + label.
 *
 * `expirationMonths === null` means "never expires" for Training, so that case is
 * resolved here rather than handed to the core. Training keeps using the stored
 * `training.expirationDate`; it is not recomputed at status time.
 */
export function getTrainingStatus(
	training: PersonnelTraining | undefined,
	type: TrainingType,
	person: Personnel
): TrainingStatusInfo {
	const isRequired = isTrainingApplicable(type, person);

	// Check exemption before other status checks
	if (type.canBeExempted && type.exemptPersonnelIds.includes(person.id)) {
		return present('exempt', 'Exempt', null);
	}

	// For optional training: show N/A only if no training record exists
	// If they have a record with a date, show normal status
	if (!isRequired && !training) {
		return present('not-required', 'N/A', null);
	}

	// No training record for required training
	if (!training) {
		return present('not-completed', 'Not Done', null);
	}

	// Never-expires training: if record exists, it's current
	// (record can exist without date for never-expires types)
	// Must be checked BEFORE the optional-without-completionDate check below,
	// since never-expires training is validly complete with null completionDate
	if (!type.expirationDateOnly && type.expirationMonths === null) {
		return present('current', 'Current', null);
	}

	// For optional training without a completion date, show N/A
	// (never-expires is already handled above)
	if (!isRequired && !training.completionDate) {
		return present('not-required', 'N/A', null);
	}

	const result = currencyStatus(
		{ completionDate: training.completionDate, expirationDate: training.expirationDate },
		{
			expirationDateOnly: type.expirationDateOnly,
			warnBands: [
				{ id: 'orange', withinDays: type.warningDaysOrange },
				{ id: 'yellow', withinDays: type.warningDaysYellow }
			]
		}
	);

	const days = result.daysUntilExpiration;
	switch (result.state) {
		case 'not-recorded':
			return present('not-completed', 'Not Done', null);
		case 'current':
			return present('current', 'Current', days);
		case 'expired':
			return present('expired', `Expired ${Math.abs(days ?? 0)}d ago`, days);
		case 'expiring':
			return present(result.band === 'orange' ? 'warning-orange' : 'warning-yellow', `${days}d left`, days);
	}
}

export interface DelinquentTraining {
	person: Personnel;
	type: TrainingType;
	training: PersonnelTraining | undefined;
	statusInfo: TrainingStatusInfo;
}

export interface DelinquentOptions {
	groupId?: string;
	includeNotCompleted?: boolean;
}

export function getDelinquentTrainings(
	personnel: Personnel[],
	types: TrainingType[],
	trainings: PersonnelTraining[],
	options: DelinquentOptions = {}
): DelinquentTraining[] {
	const { groupId, includeNotCompleted = true } = options;

	// Create a map of trainings by personnel+type
	const trainingMap = new Map<string, PersonnelTraining>();
	for (const t of trainings) {
		trainingMap.set(`${t.personnelId}-${t.trainingTypeId}`, t);
	}

	const delinquent: DelinquentTraining[] = [];

	for (const person of personnel) {
		// Filter by group if specified
		if (groupId && person.groupId !== groupId) continue;

		for (const type of types) {
			const training = trainingMap.get(`${person.id}-${type.id}`);
			const statusInfo = getTrainingStatus(training, type, person);

			// Include if expired, warning, or (optionally) not completed
			if (
				statusInfo.status === 'expired' ||
				statusInfo.status === 'warning-orange' ||
				statusInfo.status === 'warning-yellow' ||
				(includeNotCompleted && statusInfo.status === 'not-completed')
			) {
				delinquent.push({ person, type, training, statusInfo });
			}
		}
	}

	delinquent.sort((a, b) => {
		const statusDiff =
			TRAINING_STATUS_SORT_ORDER[a.statusInfo.status] - TRAINING_STATUS_SORT_ORDER[b.statusInfo.status];
		if (statusDiff !== 0) return statusDiff;

		// Within same status, sort by days (most urgent first)
		const aDays = a.statusInfo.daysUntilExpiration ?? Infinity;
		const bDays = b.statusInfo.daysUntilExpiration ?? Infinity;
		return aDays - bDays;
	});

	return delinquent;
}

export interface TrainingStats {
	current: number;
	warningYellow: number;
	warningOrange: number;
	expired: number;
	notCompleted: number;
	notRequired: number;
	total: number;
}

export function getTrainingStats(
	personnel: Personnel[],
	types: TrainingType[],
	trainings: PersonnelTraining[],
	groupId?: string
): TrainingStats {
	// Create a map of trainings by personnel+type
	const trainingMap = new Map<string, PersonnelTraining>();
	for (const t of trainings) {
		trainingMap.set(`${t.personnelId}-${t.trainingTypeId}`, t);
	}

	const stats: TrainingStats = {
		current: 0,
		warningYellow: 0,
		warningOrange: 0,
		expired: 0,
		notCompleted: 0,
		notRequired: 0,
		total: 0
	};

	for (const person of personnel) {
		// Filter by group if specified
		if (groupId && person.groupId !== groupId) continue;

		for (const type of types) {
			const training = trainingMap.get(`${person.id}-${type.id}`);
			const statusInfo = getTrainingStatus(training, type, person);
			stats.total++;

			switch (statusInfo.status) {
				case 'current':
					stats.current++;
					break;
				case 'warning-yellow':
					stats.warningYellow++;
					break;
				case 'warning-orange':
					stats.warningOrange++;
					break;
				case 'expired':
					stats.expired++;
					break;
				case 'not-completed':
					stats.notCompleted++;
					break;
				case 'not-required':
					stats.notRequired++;
					break;
			}
		}
	}

	return stats;
}
