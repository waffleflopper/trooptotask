import { describe, expect, it } from 'vitest';
import { _visibleBillingSnapshotForRole } from './+page.server';

describe('admin subscriptions server diagnostics', () => {
	it('uses the shared admin billing visibility helper', () => {
		expect(_visibleBillingSnapshotForRole('support', null)).toBeNull();
	});
});
