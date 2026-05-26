import { describe, expect, it } from 'vitest';
import { _deleteConfig, _getConfig, _putConfig } from './+server';

describe('/api/notifications route config', () => {
	it('uses policy-first identity-owned notification actions', () => {
		expect(_getConfig.policyAction?.id).toBe('identity.readOwnNotifications');
		expect(_putConfig.policyAction?.id).toBe('identity.updateOwnNotifications');
		expect(_deleteConfig.policyAction?.id).toBe('identity.deleteOwnNotifications');
		expect(_putConfig.mutation).toBe(true);
		expect(_deleteConfig.mutation).toBe(true);
		expect('permission' in _getConfig).toBe(false);
		expect('permission' in _putConfig).toBe(false);
		expect('permission' in _deleteConfig).toBe(false);
		expect('deferPolicyToUseCase' in _getConfig).toBe(false);
		expect('deferPolicyToUseCase' in _putConfig).toBe(false);
		expect('deferPolicyToUseCase' in _deleteConfig).toBe(false);
	});
});
