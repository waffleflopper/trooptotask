import { describe, it, expect } from 'vitest';
import { getCellDisplayText } from './cellDisplayText';
import type { TrainingStatusInfo } from './trainingStatus';
import type { PersonnelTraining } from '$features/training/training.types';

function makeStatusInfo(overrides: Partial<TrainingStatusInfo> = {}): TrainingStatusInfo {
	return {
		status: 'current',
		color: '#22c55e',
		label: 'Current',
		daysUntilExpiration: null,
		...overrides
	};
}

function makeTraining(overrides: Partial<PersonnelTraining> = {}): PersonnelTraining {
	return {
		id: 't-1',
		personnelId: 'p-1',
		trainingTypeId: 'tt-1',
		completionDate: '2026-01-15',
		expirationDate: '2027-01-15',
		notes: null,
		certificateUrl: null,
		...overrides
	};
}

describe('getCellDisplayText', () => {
	it('returns an inline current label with compact expiration date when available', () => {
		const result = getCellDisplayText(
			makeStatusInfo({ status: 'current' }),
			makeTraining({ completionDate: '2026-01-15' }),
			false
		);
		expect(result).toBe('Current 01/2027');
	});

	it('returns an inline current label for expiration-date-only types', () => {
		const result = getCellDisplayText(
			makeStatusInfo({ status: 'current' }),
			makeTraining({ expirationDate: '2027-01-15', completionDate: null }),
			true
		);
		expect(result).toBe('Current 01/2027');
	});

	it('returns warning label with compact date for warning-yellow status', () => {
		const result = getCellDisplayText(
			makeStatusInfo({ status: 'warning-yellow', label: '45d left', daysUntilExpiration: 45 }),
			makeTraining({ completionDate: '2025-12-01' }),
			false
		);
		expect(result).toBe('45d left 01/2027');
	});

	it('returns warning label with compact date for warning-orange status', () => {
		const result = getCellDisplayText(
			makeStatusInfo({ status: 'warning-orange', label: '15d left', daysUntilExpiration: 15 }),
			makeTraining({ completionDate: '2025-11-01' }),
			false
		);
		expect(result).toBe('15d left 01/2027');
	});

	it('returns expired label with compact date for expired status', () => {
		const result = getCellDisplayText(
			makeStatusInfo({ status: 'expired', label: 'Expired 2d ago' }),
			makeTraining({ completionDate: '2024-06-01' }),
			false
		);
		expect(result).toBe('Expired 2d ago 01/2027');
	});

	it('returns "Current" for never-expires training (no date)', () => {
		const result = getCellDisplayText(
			makeStatusInfo({ status: 'current' }),
			makeTraining({ completionDate: null, expirationDate: null }),
			false
		);
		expect(result).toBe('Current');
	});

	it('returns "Not Done" for not-completed status', () => {
		const result = getCellDisplayText(makeStatusInfo({ status: 'not-completed' }), undefined, false);
		expect(result).toBe('Not Done');
	});

	it('returns "Exempt" for exempt status', () => {
		const result = getCellDisplayText(makeStatusInfo({ status: 'exempt' }), undefined, false);
		expect(result).toBe('Exempt');
	});

	it('returns "N/A" for not-required status', () => {
		const result = getCellDisplayText(makeStatusInfo({ status: 'not-required' }), undefined, false);
		expect(result).toBe('N/A');
	});

	it('returns "Not Done" when no training record exists for required training', () => {
		const result = getCellDisplayText(makeStatusInfo({ status: 'not-completed' }), undefined, false);
		expect(result).toBe('Not Done');
	});
});
