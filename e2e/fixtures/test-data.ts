// All IDs are hardcoded for deterministic setup/teardown
export const TEST_ORG_ID = '00000000-e2e0-test-0000-000000000001';
export const TEST_GROUP_ID = '00000000-e2e0-test-0000-000000000002';

export const TEST_USERS = {
	owner: {
		email: 'e2e-owner@test.local',
		password: 'E2eTestPass123!',
		role: 'owner' as const
	},
	admin: {
		email: 'e2e-admin@test.local',
		password: 'E2eTestPass123!',
		role: 'admin' as const
	},
	member: {
		email: 'e2e-member@test.local',
		password: 'E2eTestPass123!',
		role: 'member' as const
	}
} as const;

export const TEST_ORG = {
	id: TEST_ORG_ID,
	name: 'E2E Test Organization'
};

export const TEST_GROUP = {
	id: TEST_GROUP_ID,
	name: 'Alpha Team',
	org_id: TEST_ORG_ID,
	sort_order: 0
};

// Seed personnel for predictable assertions
export const TEST_PERSONNEL = [
	{ id: '00000000-e2e0-test-0000-000000000010', first_name: 'John', last_name: 'Doe', rank: 'SGT' },
	{ id: '00000000-e2e0-test-0000-000000000011', first_name: 'Jane', last_name: 'Smith', rank: 'SPC' },
	{ id: '00000000-e2e0-test-0000-000000000012', first_name: 'Bob', last_name: 'Jones', rank: 'PFC' }
];

export const TEST_STATUS_TYPES = [
	{ id: '00000000-e2e0-test-0000-000000000020', name: 'Present', color: '#22c55e', text_color: '#ffffff', sort_order: 0 },
	{ id: '00000000-e2e0-test-0000-000000000021', name: 'Leave', color: '#3b82f6', text_color: '#ffffff', sort_order: 1 },
	{ id: '00000000-e2e0-test-0000-000000000022', name: 'TDY', color: '#f59e0b', text_color: '#000000', sort_order: 2 }
];

export const TEST_TRAINING_TYPES = [
	{ id: '00000000-e2e0-test-0000-000000000030', name: 'Weapons Qualification', sort_order: 0 },
	{ id: '00000000-e2e0-test-0000-000000000031', name: 'First Aid', sort_order: 1 }
];
