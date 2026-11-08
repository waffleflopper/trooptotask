import { randomUUID } from 'node:crypto';

const HOUR = 3_600_000;

// Pending invitations in Organization A at the states the Needs you rows and the Settings badge tell apart. Expected
// results belong to the Organization invitations and Dashboard recipes. Expiry is stamped from the clock now, so read
// the rows soon after seeding.
const CASES = [
	{ key: 'failed', hoursToExpiry: 240, delivery: 'failed' },
	{ key: 'soon', hoursToExpiry: 48, delivery: 'sent' },
	{ key: 'soonAndFailed', hoursToExpiry: 20, delivery: 'failed' },
	{ key: 'later', hoursToExpiry: 240, delivery: 'sent' },
	{ key: 'lapsed', hoursToExpiry: -24, delivery: 'failed' }
];

export async function seedInvitationAttention({ client, fixture, tag, ownedState, save }) {
	if (ownedState.seeded.some((item) => item.kind === 'invitation-attention'))
		throw new Error('Clean the existing invitation-attention seed before preparing another cohort.');
	const now = Date.now();
	const invitations = CASES.map((entry) => ({
		...entry,
		id: randomUUID(),
		email: `attention-${entry.key.toLowerCase()}-${tag}@example.test`
	}));
	// Recorded before insertion so an interrupted seed is still cleaned; deleting an invitation removes its outbox rows.
	ownedState.seeded.push({
		kind: 'invitation-attention',
		tag,
		table: 'organization_invitations',
		organization: 'orgA',
		ids: invitations.map((invitation) => invitation.id)
	});
	await save(ownedState);
	const checked = (result) => {
		if (result.error) throw new Error(`Disposable invitation fixture failed: ${result.error.message}`);
		return result.data;
	};
	checked(
		await client.from('organization_invitations').insert(
			invitations.map((invitation) => ({
				id: invitation.id,
				organization_id: fixture.ids.orgA,
				email: invitation.email,
				role: 'member',
				member_preset: 'viewer',
				status: 'pending',
				invited_by: fixture.actors.orgOwner.id,
				created_at: new Date(now - 9 * 24 * HOUR).toISOString(),
				expires_at: new Date(now + invitation.hoursToExpiry * HOUR).toISOString()
			}))
		)
	);
	checked(
		await client.from('organization_invitation_email_outbox').insert(
			invitations.map((invitation) => ({
				organization_id: fixture.ids.orgA,
				invitation_id: invitation.id,
				recipient: invitation.email,
				status: invitation.delivery,
				attempt_count: 1,
				last_error: invitation.delivery === 'failed' ? 'Synthetic delivery failure' : null,
				sent_at: invitation.delivery === 'sent' ? new Date(now - 8 * 24 * HOUR).toISOString() : null
			}))
		)
	);
	return {
		kind: 'invitation-attention',
		tag,
		invitations: invitations.map(({ key, id, email, hoursToExpiry, delivery }) => ({
			key,
			id,
			email,
			hoursToExpiry,
			delivery
		}))
	};
}
