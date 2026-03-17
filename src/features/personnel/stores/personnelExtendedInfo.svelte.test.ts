import { describe, it, expect, vi, beforeEach } from 'vitest';
import { personnelExtendedInfoStore } from './personnelExtendedInfo.svelte';
import type { PersonnelExtendedInfo } from '$features/counseling/counseling.types';

const mockInfo: PersonnelExtendedInfo[] = [
	{
		id: '1',
		personnelId: 'p1',
		emergencyContactName: 'Jane Doe',
		emergencyContactRelationship: 'Spouse',
		emergencyContactPhone: '555-0001',
		spouseName: 'Jane',
		spousePhone: null,
		vehicleMakeModel: null,
		vehiclePlate: null,
		vehicleColor: null,
		personalEmail: 'john@test.com',
		personalPhone: '555-1111',
		addressStreet: null,
		addressCity: null,
		addressState: null,
		addressZip: null,
		leaderNotes: null
	},
	{
		id: '2',
		personnelId: 'p2',
		emergencyContactName: null,
		emergencyContactRelationship: null,
		emergencyContactPhone: null,
		spouseName: null,
		spousePhone: null,
		vehicleMakeModel: null,
		vehiclePlate: null,
		vehicleColor: null,
		personalEmail: 'jane@test.com',
		personalPhone: '555-2222',
		addressStreet: null,
		addressCity: null,
		addressState: null,
		addressZip: null,
		leaderNotes: null
	}
];

function mockFetch(response: unknown) {
	return vi.fn().mockResolvedValue({
		ok: true,
		status: 200,
		json: () => Promise.resolve(response)
	});
}

describe('personnelExtendedInfoStore', () => {
	beforeEach(() => {
		vi.restoreAllMocks();
		personnelExtendedInfoStore.load(structuredClone(mockInfo), 'org-1');
	});

	describe('getByPersonnelId', () => {
		it('should find extended info by personnel ID', () => {
			expect(personnelExtendedInfoStore.getByPersonnelId('p1')?.personalEmail).toBe('john@test.com');
		});

		it('should return undefined for unknown personnel', () => {
			expect(personnelExtendedInfoStore.getByPersonnelId('unknown')).toBeUndefined();
		});
	});

	describe('upsert', () => {
		it('should update existing record', async () => {
			const updated = { ...mockInfo[0], personalEmail: 'updated@test.com' };
			vi.stubGlobal('fetch', mockFetch(updated));

			const result = await personnelExtendedInfoStore.upsert('p1', {
				personalEmail: 'updated@test.com'
			});
			expect(result).not.toBeNull();
		});

		it('should add new record when none exists', async () => {
			const created: PersonnelExtendedInfo = {
				id: '3',
				personnelId: 'p3',
				emergencyContactName: null,
				emergencyContactRelationship: null,
				emergencyContactPhone: null,
				spouseName: null,
				spousePhone: null,
				vehicleMakeModel: null,
				vehiclePlate: null,
				vehicleColor: null,
				personalEmail: 'new@test.com',
				personalPhone: null,
				addressStreet: null,
				addressCity: null,
				addressState: null,
				addressZip: null,
				leaderNotes: null
			};
			vi.stubGlobal('fetch', mockFetch(created));

			const result = await personnelExtendedInfoStore.upsert('p3', {
				personalEmail: 'new@test.com'
			});
			expect(result).not.toBeNull();
		});
	});

	describe('remove', () => {
		it('should return boolean', async () => {
			vi.stubGlobal('fetch', mockFetch({}));
			const result = await personnelExtendedInfoStore.remove('1');
			expect(result).toBe(true);
			expect(typeof result).toBe('boolean');
		});
	});
});
