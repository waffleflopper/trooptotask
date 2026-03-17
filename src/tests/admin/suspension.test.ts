import { describe, it, expect } from 'vitest';
import { validateSuspendRequest } from '$lib/server/admin';

describe('validateSuspendRequest', () => {
	it('accepts valid suspend request', () => {
		const result = validateSuspendRequest({
			type: 'user',
			targetId: '550e8400-e29b-41d4-a716-446655440000',
			action: 'suspend',
			reason: 'Violation of terms'
		});
		expect(result.valid).toBe(true);
	});

	it('accepts valid unsuspend request', () => {
		const result = validateSuspendRequest({
			type: 'org',
			targetId: '550e8400-e29b-41d4-a716-446655440000',
			action: 'unsuspend'
		});
		expect(result.valid).toBe(true);
	});

	it('rejects invalid type', () => {
		const result = validateSuspendRequest({
			type: 'group',
			targetId: '550e8400-e29b-41d4-a716-446655440000',
			action: 'suspend'
		});
		expect(result.valid).toBe(false);
	});

	it('rejects invalid UUID', () => {
		const result = validateSuspendRequest({
			type: 'user',
			targetId: 'not-a-uuid',
			action: 'suspend'
		});
		expect(result.valid).toBe(false);
	});

	it('rejects invalid action', () => {
		const result = validateSuspendRequest({
			type: 'user',
			targetId: '550e8400-e29b-41d4-a716-446655440000',
			action: 'delete'
		});
		expect(result.valid).toBe(false);
	});

	it('sanitizes reason string', () => {
		const result = validateSuspendRequest({
			type: 'user',
			targetId: '550e8400-e29b-41d4-a716-446655440000',
			action: 'suspend',
			reason: '  some reason  '
		});
		expect(result.valid).toBe(true);
		expect(result.reason).toBe('some reason');
	});
});
