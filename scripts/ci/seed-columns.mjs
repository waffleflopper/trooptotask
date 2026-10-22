import {
	expandWorkload,
	workloadMembers,
	workloads
} from '../../.agents/skills/verify-trooptotask/helpers/perf-workloads.mjs';

const actor = (name) => ({ id: `00000000-0000-4000-8000-${name.padStart(12, '0')}`, email: `${name}@example.test` });
const columns = new Map();
for (const name of Object.keys(workloads)) {
	const { organization, rows } = expandWorkload(name, {
		anchor: '2026-10-21',
		owner: actor('1'),
		scoped: actor('2'),
		scopedLeader: actor('3'),
		members: workloadMembers(name, 'ci-schema')
	});
	for (const [table, records] of Object.entries({ organizations: [organization], ...rows })) {
		if (!columns.has(table)) columns.set(table, new Set());
		for (const row of records) for (const column of Object.keys(row)) columns.get(table).add(column);
	}
}

// PostgreSQL resolves the real generated names without inserting the performance dataset.
const identifier = (value) => `"${value.replaceAll('"', '""')}"`;
console.log('BEGIN READ ONLY;');
for (const [table, names] of columns) {
	console.log(`SELECT ${[...names].map(identifier).join(', ') || '*'} FROM public.${identifier(table)} LIMIT 0;`);
}
console.log('ROLLBACK;');
