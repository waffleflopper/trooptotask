import { describe, it, expect } from 'vitest';
import {
	isGroupAccessAllowed,
	enforceGroupAccess,
	enforceGroupAccessBatch,
	type PersonnelGroupResolver
} from './groupAccess';
import type { ScopeSet } from '$lib/access/memberAccessShape';

const orgScope: ScopeSet = { kind: 'organization' };
const groupAScope: ScopeSet = { kind: 'groups', groupIds: ['group-a'] };

function createTestResolver(groups: Record<string, string | null>): PersonnelGroupResolver {
	return {
		async getGroupId(personnelId: string) {
			return personnelId in groups ? groups[personnelId] : null;
		},
		async getGroupIds(personnelIds: string[]) {
			const result = new Map<string, string | null>();
			for (const id of personnelIds) {
				if (id in groups) {
					result.set(id, groups[id]);
				}
			}
			return result;
		}
	};
}

// SvelteKit's error() throws an HttpError with status + body.message
function expectHttpError(e: unknown): { status: number; message: string } {
	const err = e as { status: number; body: { message: string } };
	return { status: err.status, message: err.body.message };
}

describe('isGroupAccessAllowed', () => {
	it('allows when Scope Set is organization-wide', () => {
		expect(isGroupAccessAllowed(orgScope, 'group-a')).toBe(true);
	});

	it('denies when Personnel Record has no Group and actor is Group-scoped', () => {
		expect(isGroupAccessAllowed(groupAScope, null)).toBe(false);
	});

	it('allows when groups match', () => {
		expect(isGroupAccessAllowed(groupAScope, 'group-a')).toBe(true);
	});

	it('denies when groups differ', () => {
		expect(isGroupAccessAllowed(groupAScope, 'group-b')).toBe(false);
	});
});

describe('enforceGroupAccess', () => {
	it('no-ops when Scope Set is organization-wide', async () => {
		const resolver = createTestResolver({ 'person-1': 'group-b' });
		await expect(enforceGroupAccess(resolver, orgScope, 'person-1')).resolves.toBeUndefined();
	});

	it('throws 403 when personnel is in a different group', async () => {
		const resolver = createTestResolver({ 'person-1': 'group-b' });
		try {
			await enforceGroupAccess(resolver, groupAScope, 'person-1');
			expect.unreachable('should have thrown');
		} catch (e) {
			const { status, message } = expectHttpError(e);
			expect(status).toBe(403);
			expect(message).toBe('You do not have access to personnel outside your group');
		}
	});

	it('throws 403 when personnel is ungrouped or not found in resolver', async () => {
		const resolver = createTestResolver({});
		try {
			await enforceGroupAccess(resolver, groupAScope, 'unknown-person');
			expect.unreachable('should have thrown');
		} catch (e) {
			const { status, message } = expectHttpError(e);
			expect(status).toBe(403);
			expect(message).toBe('You do not have access to personnel outside your group');
		}
	});
});

describe('enforceGroupAccessBatch', () => {
	it('no-ops when Scope Set is organization-wide', async () => {
		const resolver = createTestResolver({ 'p-1': 'group-b', 'p-2': 'group-c' });
		await expect(enforceGroupAccessBatch(resolver, orgScope, ['p-1', 'p-2'])).resolves.toBeUndefined();
	});

	it('passes when all personnel are in the scoped group', async () => {
		const resolver = createTestResolver({ 'p-1': 'group-a', 'p-2': 'group-a' });
		await expect(enforceGroupAccessBatch(resolver, groupAScope, ['p-1', 'p-2'])).resolves.toBeUndefined();
	});

	it('throws 403 when any personnel is in a different group', async () => {
		const resolver = createTestResolver({ 'p-1': 'group-a', 'p-2': 'group-b' });
		try {
			await enforceGroupAccessBatch(resolver, groupAScope, ['p-1', 'p-2']);
			expect.unreachable('should have thrown');
		} catch (e) {
			const { status, message } = expectHttpError(e);
			expect(status).toBe(403);
			expect(message).toBe('You do not have access to personnel outside your group');
		}
	});
});
