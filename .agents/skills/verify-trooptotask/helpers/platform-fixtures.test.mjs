import test from 'node:test';
import assert from 'node:assert/strict';
import { seedPlatform, cleanPlatform, recordPlatformUserAudit } from './platform-fixtures.mjs';

const fixture = {
	actors: Object.fromEntries(
		['orgCreator', 'orgInvitee', 'orgMember'].map((role, index) => [
			role,
			{ id: `user-${index}`, email: `${role}@example.test` }
		])
	)
};
test('interrupted setup retains every exact target before its first write', async () => {
	const ownedState = {};
	let saved;
	const client = {
		from: () => ({
			insert: async () => {
				assert.equal(saved.organization.name, 'Platform verification witness');
				assert.equal(saved.memberships.length, 3);
				assert.equal(Object.keys(saved.requests).length, 3);
				assert.ok(saved.invitation.id && saved.link.id);
				return { error: { message: 'interrupted' } };
			}
		})
	};
	await assert.rejects(
		seedPlatform({
			client,
			fixture,
			tag: 'witness',
			ownedState,
			save: async (state) => {
				saved = structuredClone(state.platform);
			}
		}),
		/interrupted/
	);
	assert.deepEqual(ownedState.platform, saved);
});
test('cleanup refuses to hide an unrestored fixture User suspension', async () => {
	let deletes = 0;
	const ownedState = { platform: { memberships: [{ user_id: 'user-1' }] } };
	const client = {
		from: () => ({
			select: () => ({ in: async () => ({ data: [{ user_id: 'user-1' }] }) }),
			delete: () => {
				deletes++;
			}
		})
	};
	await assert.rejects(
		cleanPlatform({
			client,
			fixture,
			ownedState,
			save: async () => {
				throw new Error('ledger must survive');
			}
		}),
		/Restore/
	);
	assert.equal(deletes, 0);
	assert.ok(ownedState.platform);
});

test('failed deletion retains its recorded targets for a later cleanup attempt', async () => {
	const ownedState = {
		platform: {
			organization: { id: 'temporary-org' },
			requests: { approve: { id: 'request' } },
			invitation: { id: 'invitation' },
			link: { id: 'link' },
			memberships: [],
			seededAt: '2026-10-03T00:00:00Z'
		}
	};
	let saved;
	const client = {
		from(table) {
			let deleting = false;
			const query = {
				select: () => query,
				delete: () => {
					deleting = true;
					return query;
				},
				in: () => query,
				eq: () => query,
				gte: () => query,
				or: () => query,
				then: (resolve) =>
					Promise.resolve(
						resolve(deleting && table === 'organizations' ? { error: { message: 'offline' } } : { data: [] })
					)
			};
			return query;
		}
	};
	await assert.rejects(
		cleanPlatform({
			client,
			fixture,
			ownedState,
			save: async () => {
				saved = structuredClone(ownedState);
			}
		}),
		/offline/
	);
	assert.equal(ownedState.platform.organization.id, 'temporary-org');
	assert.deepEqual(saved, ownedState);
});

// Interpret the provider's documented logical filters independently of the helper.
function splitFilters(value) {
	let depth = 0,
		start = 0;
	const parts = [];
	for (let i = 0; i < value.length; i++) {
		if (value[i] === '(') depth++;
		if (value[i] === ')') depth--;
		if (value[i] === ',' && depth === 0) {
			parts.push(value.slice(start, i));
			start = i + 1;
		}
	}
	return [...parts, value.slice(start)];
}
function matchesFilter(row, expression) {
	const group = /^(and|or)\((.*)\)$/.exec(expression);
	if (group) {
		const matches = splitFilters(group[2]).map((part) => matchesFilter(row, part));
		return group[1] === 'and' ? matches.every(Boolean) : matches.some(Boolean);
	}
	const match = /^(\w+)\.(eq|in)\.(.*)$/.exec(expression);
	assert.ok(match, 'unsupported synthetic provider filter: ' + expression);
	return match[2] === 'eq' ? row[match[1]] === match[3] : match[3].slice(1, -1).split(',').includes(row[match[1]]);
}

test('cleanup removes its activity while retaining unrelated and earlier audit history for reused Users', async () => {
	const organization = { id: 'temporary-org' };
	const rows = {
		organizations: [organization],
		audit_logs: [
			{ id: 'run-event', org_id: organization.id, resource_id: organization.id, timestamp: '2026-10-03T00:01:00Z' },
			{ id: 'unrelated-event', org_id: 'sentinel-org', resource_id: 'sentinel', timestamp: '2026-10-03T00:01:00Z' },
			{
				id: 'platform-user-event',
				org_id: null,
				resource_id: 'user-1',
				action: 'suspend_user',
				timestamp: '2026-10-03T00:01:00Z'
			},
			{
				id: 'untracked-platform-event',
				org_id: null,
				resource_id: 'user-1',
				action: 'suspend_user',
				timestamp: '2026-10-03T00:02:00Z'
			},
			{
				id: 'user-auth-event',
				org_id: null,
				resource_id: 'user-1',
				action: 'auth.password_update_rate_limited',
				timestamp: '2026-10-03T00:01:00Z'
			},
			{
				id: 'earlier-platform-event',
				org_id: null,
				resource_id: 'user-1',
				action: 'suspend_user',
				timestamp: '2026-10-02T23:59:00Z'
			}
		]
	};
	const client = {
		from(table) {
			let mutation = false;
			const filters = [];
			const query = {
				select() {
					return query;
				},
				delete() {
					mutation = true;
					return query;
				},
				eq(key, value) {
					filters.push((row) => row[key] === value);
					return query;
				},
				in(key, values) {
					filters.push((row) => values.includes(row[key]));
					return query;
				},
				gte(key, value) {
					filters.push((row) => row[key] >= value);
					return query;
				},
				or(expression) {
					filters.push((row) => splitFilters(expression).some((part) => matchesFilter(row, part)));
					return query;
				},
				then(resolve) {
					const matched = (rows[table] ?? []).filter((row) => filters.every((filter) => filter(row)));
					if (mutation) {
						rows[table] = (rows[table] ?? []).filter((row) => !matched.includes(row));
						if (table === 'organizations')
							for (const row of rows.audit_logs) if (row.org_id === organization.id) row.org_id = null;
					}
					return Promise.resolve(resolve({ data: matched }));
				}
			};
			return query;
		}
	};
	const ownedState = {
		platform: {
			organization,
			requests: { approve: { id: 'request' } },
			invitation: { id: 'invitation' },
			link: { id: 'link' },
			memberships: [{ user_id: 'user-1' }],
			userAuditIds: ['platform-user-event'],
			seededAt: '2026-10-03T00:00:00Z'
		}
	};
	const result = await cleanPlatform({ client, fixture, ownedState, save: async () => {} });
	assert.deepEqual(new Set(result.removedAuditIds), new Set(['run-event', 'platform-user-event']));
	assert.deepEqual(
		rows.audit_logs.map(({ id }) => id),
		['unrelated-event', 'untracked-platform-event', 'user-auth-event', 'earlier-platform-event']
	);
	assert.equal(ownedState.platform, undefined);
});

test('recording User audit IDs persists only the explicit observed event, not other matching history', async () => {
	const observedId = '11111111-1111-4111-8111-111111111111';
	const ownedState = { platform: { memberships: [{ user_id: 'user-1' }], seededAt: '2026-10-03T00:00:00Z' } };
	let saved;
	const query = { select: () => query, in: () => query, gte: async () => ({ data: [{ id: observedId }] }) };
	await recordPlatformUserAudit({
		client: { from: () => query },
		ownedState,
		ids: [observedId, observedId],
		save: async (state) => {
			saved = structuredClone(state);
		}
	});
	assert.deepEqual(saved.platform.userAuditIds, [observedId]);
});

test('missing or out-of-scope audit acknowledgements cannot grant cleanup authority', async () => {
	const ownedState = { platform: { memberships: [{ user_id: 'user-1' }], seededAt: '2026-10-03T00:00:00Z' } };
	const query = { select: () => query, in: () => query, gte: async () => ({ data: [] }) };
	let writes = 0;
	await assert.rejects(
		recordPlatformUserAudit({
			client: { from: () => query },
			ownedState,
			ids: ['11111111-1111-4111-8111-111111111111'],
			save: async () => {
				writes++;
			}
		}),
		/Every recorded/
	);
	assert.equal(writes, 0);
	assert.equal(ownedState.platform.userAuditIds, undefined);
});
