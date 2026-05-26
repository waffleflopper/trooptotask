import { describe, expect, it, vi } from 'vitest';
import { _createPersonnelDetailPageLoad } from './+page.server';

const operateAuth = {
	orgId: 'org-1',
	role: 'member',
	capabilityMap: {
		calendar: 'view',
		personnel: 'configure',
		training: 'view',
		criticalTasks: 'view',
		onboarding: 'view',
		ratingScheme: 'view'
	},
	compatibilityLanes: {},
	scopeSet: { kind: 'organization' },
	requireGroupAccess: vi.fn(async () => {})
};

describe('personnel detail page server load', () => {
	it('loads detail streams for the layout-resolved personnel id without resolving the slug again', async () => {
		const ctx = {
			store: {
				findOne: vi.fn(async (_table: string, _orgId: string, filters: Record<string, unknown>) => {
					if (filters.id === 'person-1') return { id: 'person-1', group_id: null };
					return null;
				}),
				findMany: vi.fn(async () => [])
			},
			auth: { ...operateAuth },
			audit: { log: vi.fn() },
			readOnlyGuard: { check: vi.fn(async () => false) }
		};
		const loadWithContext = vi.fn(async (_locals, _cookies, _orgId, config) => config.fn(ctx));
		const load = _createPersonnelDetailPageLoad({ loadWithContext });
		const depends = vi.fn();

		const result = await load({
			params: { orgId: 'org-1', personnelSlug: 'rivera-monica' },
			locals: {} as App.Locals,
			cookies: {} as never,
			depends,
			parent: vi.fn(async () => ({
				personnelDetailHeader: {
					person: { id: 'person-1' }
				}
			}))
		} as never);

		await result.personnelDetail.extendedInfo;
		expect(depends).toHaveBeenCalledWith('app:personnel-detail');
		expect(ctx.store.findOne).not.toHaveBeenCalledWith('personnel', 'org-1', { slug: 'rivera-monica' }, 'id');
		expect(ctx.store.findMany).toHaveBeenCalledWith('personnel_extended_info', 'org-1', {
			personnel_id: 'person-1'
		});
	});

	it('streams expanded Soldier Data Sheet fields for the resolved Personnel Slug', async () => {
		const ctx = {
			store: {
				findOne: vi.fn(async (_table: string, _orgId: string, filters: Record<string, unknown>) => {
					if (filters.id === 'person-1') return { id: 'person-1', group_id: null };
					return null;
				}),
				findMany: vi.fn(async (table: string) => {
					if (table !== 'personnel_extended_info') return [];
					return [
						{
							id: 'info-1',
							personnel_id: 'person-1',
							blood_type: 'O+',
							basd: '2020-01-15',
							date_of_rank: '2024-06-01',
							marital_status: 'Married',
							number_of_dependents: 2,
							children: [{ name: 'Avery', age: 7 }],
							civilian_education: 'BSN',
							military_education: ['BLC'],
							emergency_contact_name: 'Jamie Rivera',
							emergency_contact_relationship: 'Spouse',
							emergency_contact_phone: '907-555-0100',
							spouse_name: 'Jamie Rivera',
							spouse_phone: '907-555-0101',
							vehicle_make_model: 'Toyota Tacoma',
							vehicle_plate: 'JBER482',
							vehicle_color: 'Gray',
							personal_email: 'rivera@example.com',
							personal_phone: '907-555-0102',
							address_street: '1128 Arctic Valley Rd',
							address_city: 'Anchorage',
							address_state: 'AK',
							address_zip: '99505',
							leader_notes: 'Strong performer'
						}
					];
				})
			},
			auth: { ...operateAuth, requireGroupAccess: vi.fn(async () => {}) },
			audit: { log: vi.fn() },
			readOnlyGuard: { check: vi.fn(async () => false) }
		};
		const loadWithContext = vi.fn(async (_locals, _cookies, _orgId, config) => config.fn(ctx));
		const load = _createPersonnelDetailPageLoad({ loadWithContext });

		const result = await load({
			params: { orgId: 'org-1', personnelSlug: 'rivera-monica' },
			locals: {} as App.Locals,
			cookies: {} as never,
			depends: vi.fn(),
			parent: vi.fn(async () => ({
				personnelDetailHeader: {
					person: { id: 'person-1' }
				}
			}))
		} as never);

		await expect(result.personnelDetail.extendedInfo).resolves.toMatchObject({
			bloodType: 'O+',
			basd: '2020-01-15',
			dateOfRank: '2024-06-01',
			maritalStatus: 'Married',
			numberOfDependents: 2,
			children: [{ name: 'Avery', age: 7 }],
			civilianEducation: 'BSN',
			militaryEducation: ['BLC']
		});
	});

	it('uses the parent personnel id for all dashboard streams', async () => {
		const ctx = {
			store: {
				findOne: vi.fn(async () => ({ id: 'person-9', group_id: null })),
				findMany: vi.fn(async () => [])
			},
			auth: { ...operateAuth, requireGroupAccess: vi.fn(async () => {}) },
			audit: { log: vi.fn() },
			readOnlyGuard: { check: vi.fn(async () => false) }
		};
		const loadWithContext = vi.fn(async (_locals, _cookies, _orgId, config) => config.fn(ctx));
		const load = _createPersonnelDetailPageLoad({ loadWithContext });
		const parent = vi.fn(async () => ({
			personnelDetailHeader: {
				person: { id: 'person-9' }
			}
		}));

		const result = await load({
			params: { orgId: 'org-1', personnelSlug: 'old-rivera-monica' },
			locals: {} as App.Locals,
			cookies: {} as never,
			depends: vi.fn(),
			parent
		} as never);

		await result.personnelDetail.counselingRecords;
		expect(parent).toHaveBeenCalled();
		expect(ctx.store.findMany).toHaveBeenCalledWith(
			'counseling_records',
			'org-1',
			{ personnel_id: 'person-9' },
			expect.any(Object)
		);
	});
});
