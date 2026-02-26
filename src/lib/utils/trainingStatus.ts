import type { Personnel, TrainingType, PersonnelTraining, TrainingStatus } from '../types';
import { TRAINING_STATUS_COLORS } from '../types';
import { formatDate } from './dates';

export interface TrainingStatusInfo {
	status: TrainingStatus;
	color: string;
	label: string;
	daysUntilExpiration: number | null;
}

export function calculateExpirationDate(completionDate: string | null, expirationMonths: number | null): string | null {
	if (expirationMonths === null || !completionDate) return null;
	const date = new Date(completionDate);
	date.setMonth(date.getMonth() + expirationMonths);
	return formatDate(date);
}

export function getTrainingStatus(
	training: PersonnelTraining | undefined,
	type: TrainingType,
	person: Personnel
): TrainingStatusInfo {
	// Check if this training is required for the person's role
	// '*' means required for all roles, [] means optional for all
	const isRequired =
		type.requiredForRoles.includes('*') || type.requiredForRoles.includes(person.clinicRole);

	// For optional training: show N/A only if no training record exists
	// If they have a record with a date, show normal status
	if (!isRequired && !training) {
		return {
			status: 'not-required',
			color: TRAINING_STATUS_COLORS['not-required'],
			label: 'N/A',
			daysUntilExpiration: null
		};
	}

	// For optional training without a completion date, still show N/A
	if (!isRequired && training && !training.completionDate) {
		return {
			status: 'not-required',
			color: TRAINING_STATUS_COLORS['not-required'],
			label: 'N/A',
			daysUntilExpiration: null
		};
	}

	// No training record for required training
	if (!training) {
		return {
			status: 'not-completed',
			color: TRAINING_STATUS_COLORS['not-completed'],
			label: 'Not Done',
			daysUntilExpiration: null
		};
	}

	// Never-expires training: if record exists, it's current
	// (record can exist without date for never-expires types)
	if (!type.expirationDateOnly && type.expirationMonths === null) {
		return {
			status: 'current',
			color: TRAINING_STATUS_COLORS['current'],
			label: 'Current',
			daysUntilExpiration: null
		};
	}

	if (type.expirationDateOnly) {
		// Expiration-date-only: the record stores expiration date directly, no completion date needed
		if (!training.expirationDate) {
			return {
				status: 'not-completed',
				color: TRAINING_STATUS_COLORS['not-completed'],
				label: 'Not Done',
				daysUntilExpiration: null
			};
		}
		// Fall through to expiration date check below
	} else {
		// Normal expiring training: requires completion date
		if (!training.completionDate) {
			return {
				status: 'not-completed',
				color: TRAINING_STATUS_COLORS['not-completed'],
				label: 'Not Done',
				daysUntilExpiration: null
			};
		}

		// If no expiration date but has completion date, it's current
		if (!training.expirationDate) {
			return {
				status: 'current',
				color: TRAINING_STATUS_COLORS['current'],
				label: 'Current',
				daysUntilExpiration: null
			};
		}
	}

	const today = new Date();
	today.setHours(0, 0, 0, 0);
	const expiration = new Date(training.expirationDate);
	expiration.setHours(0, 0, 0, 0);

	const daysUntilExpiration = Math.floor((expiration.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

	if (daysUntilExpiration < 0) {
		return {
			status: 'expired',
			color: TRAINING_STATUS_COLORS['expired'],
			label: `Expired ${Math.abs(daysUntilExpiration)}d ago`,
			daysUntilExpiration
		};
	}

	if (daysUntilExpiration < type.warningDaysOrange) {
		return {
			status: 'warning-orange',
			color: TRAINING_STATUS_COLORS['warning-orange'],
			label: `${daysUntilExpiration}d left`,
			daysUntilExpiration
		};
	}

	if (daysUntilExpiration < type.warningDaysYellow) {
		return {
			status: 'warning-yellow',
			color: TRAINING_STATUS_COLORS['warning-yellow'],
			label: `${daysUntilExpiration}d left`,
			daysUntilExpiration
		};
	}

	return {
		status: 'current',
		color: TRAINING_STATUS_COLORS['current'],
		label: 'Current',
		daysUntilExpiration
	};
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

	// Sort by urgency: expired first (by days since), then orange, yellow, not-completed
	const statusOrder: Record<TrainingStatus, number> = {
		expired: 0,
		'warning-orange': 1,
		'warning-yellow': 2,
		'not-completed': 3,
		current: 4,
		'not-required': 5
	};

	delinquent.sort((a, b) => {
		const statusDiff = statusOrder[a.statusInfo.status] - statusOrder[b.statusInfo.status];
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
