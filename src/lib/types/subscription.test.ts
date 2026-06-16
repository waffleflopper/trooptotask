import { describe, expect, it } from 'vitest';
import { PUBLIC_PLAN_PRESENTATION, TIER_CONFIG } from './subscription';

describe('subscription tier contract', () => {
	it('keeps paid public prices aligned with tier configuration', () => {
		const teamPlan = PUBLIC_PLAN_PRESENTATION.find((plan) => plan.key === 'team');
		const unitPlan = PUBLIC_PLAN_PRESENTATION.find((plan) => plan.key === 'unit');

		expect(TIER_CONFIG.team.priceMonthly).toBe(499);
		expect(TIER_CONFIG.unit.priceMonthly).toBe(1099);
		expect(teamPlan).toMatchObject({
			priceMonthly: TIER_CONFIG.team.priceMonthly,
			priceLabel: '$4.99',
			exportAllowance: '10 exports per month'
		});
		expect(unitPlan).toMatchObject({
			priceMonthly: TIER_CONFIG.unit.priceMonthly,
			priceLabel: '$10.99',
			exportAllowance: 'Unlimited exports'
		});
	});

	it('keeps public plan differences to capacity and export allowance', () => {
		const teamPlan = PUBLIC_PLAN_PRESENTATION.find((plan) => plan.key === 'team');
		const unitPlan = PUBLIC_PLAN_PRESENTATION.find((plan) => plan.key === 'unit');

		expect(teamPlan).toMatchObject({
			personnelCapacity: 'Up to 80 personnel',
			accountUsers: 'Unlimited account users'
		});
		expect(unitPlan).toMatchObject({
			personnelCapacity: 'Up to 500 personnel',
			accountUsers: 'Unlimited account users'
		});
		expect(PUBLIC_PLAN_PRESENTATION.map((plan) => plan.name)).toEqual(['Free', 'Team', 'Unit', 'Enterprise']);
	});
});
