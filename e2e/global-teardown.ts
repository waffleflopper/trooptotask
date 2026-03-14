import { adminClient } from './fixtures/supabase';
import { TEST_ORG, TEST_USERS } from './fixtures/test-data';

async function globalTeardown() {
	const orgId = TEST_ORG.id;

	// Delete in FK-safe order

	// 1. Delete personnel-related data (all child records first)
	await adminClient.from('counseling_records').delete().eq('organization_id', orgId);
	await adminClient.from('availability_entries').delete().eq('organization_id', orgId);
	await adminClient.from('personnel_trainings').delete().eq('organization_id', orgId);
	await adminClient.from('deletion_requests').delete().eq('organization_id', orgId);

	// 2. Delete personnel
	await adminClient.from('personnel').delete().eq('organization_id', orgId);

	// 3. Delete org types
	await adminClient.from('status_types').delete().eq('organization_id', orgId);
	await adminClient.from('training_types').delete().eq('organization_id', orgId);
	await adminClient.from('counseling_types').delete().eq('organization_id', orgId);

	// 4. Delete org members
	await adminClient.from('organization_memberships').delete().eq('organization_id', orgId);

	// 5. Delete groups
	await adminClient.from('groups').delete().eq('organization_id', orgId);

	// 6. Delete audit logs and notifications
	await adminClient.from('audit_logs').delete().eq('organization_id', orgId);
	await adminClient.from('notifications').delete().eq('organization_id', orgId);

	// 7. Delete org
	await adminClient.from('organizations').delete().eq('id', orgId);

	// 8. Delete auth users
	for (const [, userData] of Object.entries(TEST_USERS)) {
		const { data: users } = await adminClient.auth.admin.listUsers();
		const user = users?.users?.find((u) => u.email === userData.email);
		if (user) {
			await adminClient.auth.admin.deleteUser(user.id);
		}
	}

	console.log('E2E global teardown complete: test data cleaned up.');
}

export default globalTeardown;
