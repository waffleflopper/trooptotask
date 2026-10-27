import { describe, expect, it } from 'vitest';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { _getConfig } from './+server';

describe('GET /api/calendar-taskings/choices', () => {
	it('answers only a viewer who may manage Taskings', () => {
		expect(_getConfig.policyAction).toBe(POLICY_ACTION_CATALOG.calendar.manageTaskings);
		expect(_getConfig.policyResource).toEqual({ kind: 'unscoped' });
	});
});
