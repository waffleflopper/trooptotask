import { describe, expect, it } from 'vitest';
import { getIctStatus } from '$features/critical-tasks';
import type { Personnel } from '$features/personnel/contracts';
import { getTrainingStatus, type PersonnelTraining, type TrainingType } from '$features/training';

const WARNING_DAYS = 60;

const person: Personnel = {
	id: 'p1',
	rank: 'SGT',
	lastName: 'Test',
	firstName: 'Pat',
	mos: '68W',
	clinicRole: 'Medic',
	groupId: 'g1',
	groupName: 'Alpha'
};

function typeWithMonths(expirationMonths: number): TrainingType {
	return {
		id: 'type-1',
		archivedAt: null,
		name: 'CPR',
		description: null,
		expirationMonths,
		warningDaysYellow: WARNING_DAYS,
		warningDaysOrange: 30,
		appliesToRoles: [],
		appliesToMos: [],
		appliesToRanks: [],
		excludedRoles: [],
		excludedMos: [],
		excludedRanks: [],
		color: '#22c55e',
		sortOrder: 0,
		expirationDateOnly: false,
		canBeExempted: false,
		exemptPersonnelIds: [],
		isOptional: false
	};
}

function completedOn(completionDate: string): PersonnelTraining {
	return {
		id: 't1',
		personnelId: 'p1',
		trainingTypeId: 'type-1',
		completionDate,
		expirationDate: null,
		notes: null,
		certificateUrl: null
	};
}

const isWarning = (status: string) => status === 'warning-yellow' || status === 'warning-orange';

describe('Training and Critical Tasks read a completion the same way', () => {
	it.each([
		{
			name: 'a month-end completion clamped into a shorter month',
			completed: '2025-01-31',
			months: 1,
			asOf: '2025-02-27'
		},
		{ name: 'the day a clamped expiry falls', completed: '2025-01-31', months: 1, asOf: '2025-02-28' },
		{ name: 'the day after a clamped expiry', completed: '2025-01-31', months: 1, asOf: '2025-03-01' },
		{ name: 'a leap-day completion in a non-leap year', completed: '2024-02-29', months: 12, asOf: '2025-02-28' },
		{ name: 'the first day inside the warning window', completed: '2025-08-14', months: 12, asOf: '2026-06-15' },
		{ name: 'the last day outside the warning window', completed: '2025-08-15', months: 12, asOf: '2026-06-15' },
		{ name: 'the day it expires', completed: '2025-06-15', months: 12, asOf: '2026-06-15' },
		{ name: 'the day after it expires', completed: '2025-06-14', months: 12, asOf: '2026-06-15' },
		{ name: 'a long interval', completed: '2023-03-31', months: 36, asOf: '2026-03-30' }
	])('on $name', ({ completed, months, asOf }) => {
		const training = getTrainingStatus(completedOn(completed), typeWithMonths(months), person, asOf);
		const ict = getIctStatus(completed, { expirationMonths: months }, { expiringSoonWarningDays: WARNING_DAYS }, asOf);

		expect(training.expirationDate).toBe(ict.expirationDate);
		expect(training.daysUntilExpiration).toBe(ict.daysUntilExpiration);
		expect(training.status === 'expired').toBe(ict.status === 'expired');
		expect(isWarning(training.status)).toBe(ict.status === 'expiring-soon');
	});

	it('pins the clamped boundary days to literal values', () => {
		const training = completedOn('2025-01-31');
		const type = typeWithMonths(1);

		expect(getTrainingStatus(training, type, person, '2025-02-28')).toMatchObject({
			expirationDate: '2025-02-28',
			daysUntilExpiration: 0,
			status: 'warning-orange'
		});
		expect(getTrainingStatus(training, type, person, '2025-03-01')).toMatchObject({
			expirationDate: '2025-02-28',
			daysUntilExpiration: -1,
			status: 'expired'
		});
	});
});
