import { describe, it, expect } from 'vitest';
import {
	isGroupAccessAllowed,
	enforceGroupAccess,
	enforceGroupAccessBatch,
	createInMemoryGroupResolver
} from './groupAccess';

// SvelteKit's error() throws an HttpError with status + body.message
function expectHttpError(e: unknown): { status: number; message: string } {
	const err = e as { status: number; body: { message: string } };
	return { status: err.status, message: err.body.message };
}

describe('isGroupAccessAllowed', () => {
	it('allows when scopedGroupId is null (org-wide user)', () => {
		expect(isGroupAccessAllowed(null, 'group-a')).toBe(true);
	});

	it('allows when personnelGroupId is null (person has no group)', () => {
		expect(isGroupAccessAllowed('group-a', null)).toBe(true);
	});

	it('allows when groups match', () => {
		expect(isGroupAccessAllowed('group-a', 'group-a')).toBe(true);
	});

	it('denies when groups differ', () => {
		expect(isGroupAccessAllowed('group-a', 'group-b')).toBe(false);
	});
});

describe('enforceGroupAccess', () => {
	it('no-ops when scopedGroupId is null (org-wide user)', async () => {
		const resolver = createInMemoryGroupResolver({ 'person-1': 'group-b' });
		await expect(enforceGroupAccess(resolver, null, 'person-1')).resolves.toBeUndefined();
	});

	it('throws 403 when personnel is in a different group', async () => {
		const resolver = createInMemoryGroupResolver({ 'person-1': 'group-b' });
		try {
			await enforceGroupAccess(resolver, 'group-a', 'person-1');
			expect.unreachable('should have thrown');
		} catch (e) {
			const { status, message } = expectHttpError(e);
			expect(status).toBe(403);
			expect(message).toBe('You do not have access to personnel outside your group');
		}
	});

	it('allows when personnel is not found in resolver (graceful)', async () => {
		const resolver = createInMemoryGroupResolver({});
		await expect(enforceGroupAccess(resolver, 'group-a', 'unknown-person')).resolves.toBeUndefined();
	});
});

describe('enforceGroupAccessBatch', () => {
	it('no-ops when scopedGroupId is null', async () => {
		const resolver = createInMemoryGroupResolver({ 'p-1': 'group-b', 'p-2': 'group-c' });
		await expect(enforceGroupAccessBatch(resolver, null, ['p-1', 'p-2'])).resolves.toBeUndefined();
	});

	it('passes when all personnel are in the scoped group', async () => {
		const resolver = createInMemoryGroupResolver({ 'p-1': 'group-a', 'p-2': 'group-a' });
		await expect(enforceGroupAccessBatch(resolver, 'group-a', ['p-1', 'p-2'])).resolves.toBeUndefined();
	});

	it('throws 403 when any personnel is in a different group', async () => {
		const resolver = createInMemoryGroupResolver({ 'p-1': 'group-a', 'p-2': 'group-b' });
		try {
			await enforceGroupAccessBatch(resolver, 'group-a', ['p-1', 'p-2']);
			expect.unreachable('should have thrown');
		} catch (e) {
			const { status, message } = expectHttpError(e);
			expect(status).toBe(403);
			expect(message).toBe('You do not have access to personnel outside your group');
		}
	});
});
