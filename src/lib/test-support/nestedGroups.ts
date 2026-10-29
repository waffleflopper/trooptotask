export const NESTED_GROUPS = [
	{ id: 'platoon', name: '1st Platoon', sortOrder: 0, parentId: null, depth: 1 as const },
	{ id: 'squad', name: '2nd Squad', sortOrder: 0, parentId: 'platoon', depth: 2 as const },
	{ id: 'alpha', name: 'Alpha Team', sortOrder: 0, parentId: 'squad', depth: 3 as const },
	{ id: 'bravo', name: 'Bravo Team', sortOrder: 1, parentId: 'squad', depth: 3 as const },
	{ id: 'other-squad', name: '3rd Squad', sortOrder: 1, parentId: 'platoon', depth: 2 as const },
	{ id: 'other-platoon', name: '2nd Platoon', sortOrder: 1, parentId: null, depth: 1 as const }
];
