import assert from 'node:assert/strict';
import { test } from 'node:test';
import { seedInvitationAttention } from './invitation-fixtures.mjs';

const fixture = { ids: { orgA: 'org-a' }, actors: { orgOwner: { id: 'owner' } } };

function fakeClient(persisted, failOn) {
	const inserted = {};
	return {
		inserted,
		from(table) {
			return {
				async insert(rows) {
					assert.ok(persisted.value, 'Cleanup ownership must precede provider writes.');
					if (table === failOn) return { error: { message: 'boom' } };
					inserted[table] = rows;
					return { data: rows, error: null };
				}
			};
		}
	};
}

test('seeds one unexpired and one expired invitation per delivery state, owned before any insert', async () => {
	const persisted = { value: null };
	const ownedState = { seeded: [] };
	const client = fakeClient(persisted);
	const result = await seedInvitationAttention({
		client,
		fixture,
		tag: 'abc',
		ownedState,
		save: async (state) => (persisted.value = structuredClone(state))
	});
	assert.deepEqual(
		persisted.value.seeded[0].ids,
		client.inserted.organization_invitations.map((row) => row.id)
	);
	const byKey = Object.fromEntries(result.invitations.map((entry) => [entry.key, entry]));
	assert.deepEqual(Object.keys(byKey), ['failed', 'soon', 'soonAndFailed', 'later', 'lapsed']);
	const expiry = Object.fromEntries(
		client.inserted.organization_invitations.map((row) => [row.id, new Date(row.expires_at).getTime() - Date.now()])
	);
	assert.ok(expiry[byKey.lapsed.id] < 0);
	assert.ok(expiry[byKey.soonAndFailed.id] > 0 && expiry[byKey.soonAndFailed.id] < 72 * 3_600_000);
	assert.ok(expiry[byKey.later.id] > 72 * 3_600_000);
	const outbox = Object.fromEntries(
		client.inserted.organization_invitation_email_outbox.map((row) => [row.recipient, row.status])
	);
	assert.equal(outbox[byKey.failed.email], 'failed');
	assert.equal(outbox[byKey.soon.email], 'sent');
});

test('an interrupted insert keeps the cleanup record and a second cohort is refused', async () => {
	const persisted = { value: null };
	const ownedState = { seeded: [] };
	const save = async (state) => (persisted.value = structuredClone(state));
	await assert.rejects(
		seedInvitationAttention({
			client: fakeClient(persisted, 'organization_invitation_email_outbox'),
			fixture,
			tag: 'abc',
			ownedState,
			save
		}),
		/Disposable invitation fixture failed: boom/
	);
	assert.equal(persisted.value.seeded[0].kind, 'invitation-attention');
	await assert.rejects(
		seedInvitationAttention({ client: fakeClient(persisted), fixture, tag: 'def', ownedState, save }),
		/Clean the existing invitation-attention seed/
	);
});
