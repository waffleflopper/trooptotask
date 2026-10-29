import { afterEach, expect, it, vi } from 'vitest';
import { groupCatalogHydration, groupManagementStore } from '../stores/groups.svelte';
import { groupReference } from './personnelReferences';
import type { Group } from '../group.types';

vi.mock('$app/navigation', () => ({ invalidate: vi.fn(async () => {}) }));
afterEach(() => vi.unstubAllGlobals());

it('creates missing import Groups at the root while deduplicating only existing roots', async () => {
	groupCatalogHydration.load(
		[
			{ id: 'platoon', name: 'Platoon', sortOrder: 0, parentId: null, depth: 1 },
			{ id: 'team', name: 'Alpha', sortOrder: 0, parentId: 'platoon', depth: 2 }
		],
		'org-1'
	);
	vi.stubGlobal(
		'fetch',
		vi.fn(async (_url, init) => Response.json({ id: 'root-alpha', ...JSON.parse(init.body) }))
	);
	const reference = groupReference(groupManagementStore.items, { canCreate: true, allowUnassigned: true });
	if (!reference.create) throw new Error('Expected an import creation command');
	expect(await reference.create('Alpha')).toMatchObject({ kind: 'created', option: { id: 'root-alpha' } });
	expect(await reference.create(' alpha ')).toMatchObject({ kind: 'created', option: { id: 'root-alpha' } });
	expect(new Map(groupManagementStore.items.map((group) => [group.id, group.parentId]))).toEqual(
		new Map([
			['platoon', null],
			['team', 'platoon'],
			['root-alpha', null]
		])
	);
});

const tree = [
	{ id: 'plt1', name: '1st Platoon', sortOrder: 0, parentId: null, depth: 1 as const },
	{ id: 'p1-sq1', name: '1st Squad', sortOrder: 0, parentId: 'plt1', depth: 2 as const },
	{ id: 'p1-sq1-alpha', name: 'Alpha Team', sortOrder: 0, parentId: 'p1-sq1', depth: 3 as const },
	{ id: 'plt2', name: '2nd Platoon', sortOrder: 1, parentId: null, depth: 1 as const },
	{ id: 'p2-sq1', name: '1st Squad', sortOrder: 0, parentId: 'plt2', depth: 2 as const },
	{ id: 'p2-sq1-alpha', name: 'Alpha Team', sortOrder: 0, parentId: 'p2-sq1', depth: 3 as const },
	{ id: 'p2-sq1-bravo', name: 'Bravo Team', sortOrder: 1, parentId: 'p2-sq1', depth: 3 as const },
	{ id: 'legacy', name: 'Clinic / Lab', sortOrder: 2, parentId: null, depth: 1 as const },
	{ id: 'clinic', name: 'Clinic', sortOrder: 3, parentId: null, depth: 1 as const },
	{ id: 'clinic-lab', name: 'Lab', sortOrder: 0, parentId: 'clinic', depth: 2 as const }
];

function matchGroup(groups: typeof tree, value: string) {
	const reference = groupReference(groups, { canCreate: false, allowUnassigned: false });
	const match = reference.find(reference.key({ groupName: value } as never)!.key);
	if (match.kind === 'one') return { one: match.option.id };
	if (match.kind === 'many') return { many: match.candidates.map((option) => option.label) };
	return { none: match.suggestion?.id ?? null };
}

it.each([
	['a unique name', 'Bravo Team', { one: 'p2-sq1-bravo' }],
	['an exported path', '2nd Platoon / 1st Squad / Alpha Team', { one: 'p2-sq1-alpha' }],
	['a path in other spacing and case', '  1st platoon /  1st SQUAD / alpha team ', { one: 'p1-sq1-alpha' }],
	['a legacy name containing the separator before the path it spells', 'Clinic / Lab', { one: 'legacy' }],
	['a path to a missing Group', '1st Platoon / 2nd Squad', { none: null }],
	[
		'a bare name two squads share, asking for the path',
		'Alpha Team',
		{ many: ['1st Platoon / 1st Squad / Alpha Team', '2nd Platoon / 1st Squad / Alpha Team'] }
	]
])('matches %s', (_case, value, expected) => {
	expect(matchGroup(tree, value)).toEqual(expected);
});

it("reads a team leader's own team, the only root they see, by name and not by the full path", () => {
	const visible = [tree[5]];

	expect(matchGroup(visible, 'Alpha Team')).toEqual({ one: 'p2-sq1-alpha' });
	expect(matchGroup(visible, '2nd Platoon / 1st Squad / Alpha Team')).toEqual({ none: null });
});

it('creates a missing path one level at a time, reusing the levels that exist', async () => {
	groupCatalogHydration.load(tree.slice(0, 3), 'org-1');
	const sent: unknown[] = [];
	vi.stubGlobal(
		'fetch',
		vi.fn(async (_url, init) => {
			const body = JSON.parse(init.body);
			sent.push(body);
			return Response.json({ id: `new-${body.name}`, ...body });
		})
	);
	const reference = groupReference(groupManagementStore.items, { canCreate: true, allowUnassigned: true });

	expect(await reference.create!('1st Platoon / 2nd Squad / Bravo Team')).toMatchObject({
		kind: 'created',
		option: { id: 'new-Bravo Team', label: '1st Platoon / 2nd Squad / Bravo Team' }
	});
	expect(await reference.create!('1st Platoon / 1st Squad / Alpha Team')).toMatchObject({
		kind: 'created',
		option: { id: 'p1-sq1-alpha' }
	});
	expect(await reference.create!('A / B / C / D')).toEqual({
		kind: 'refused',
		message: 'Groups can nest at most three levels deep.'
	});
	expect(sent).toEqual([
		{ name: '2nd Squad', sortOrder: 1, parentId: 'plt1', depth: 2 },
		{ name: 'Bravo Team', sortOrder: 0, parentId: 'new-2nd Squad', depth: 3 }
	]);
});

it('waits for the confirmed shared parent when missing paths are created together', async () => {
	groupCatalogHydration.load([], 'org-1');
	const parentReply = Promise.withResolvers<Response>();
	const parentPosted = Promise.withResolvers<void>();
	const sent: Array<{ name: string; parentId: string | null }> = [];
	vi.stubGlobal(
		'fetch',
		vi.fn(async (_url, init) => {
			const body = JSON.parse(init.body);
			sent.push({ name: body.name, parentId: body.parentId });
			if (body.name === 'New Platoon') {
				parentPosted.resolve();
				return parentReply.promise;
			}
			return Response.json({ ...body, id: `saved-${body.name}` });
		})
	);
	const reference = groupReference(groupManagementStore.items, { canCreate: true, allowUnassigned: true });
	const alpha = reference.create!('New Platoon / Alpha Team');
	await parentPosted.promise;
	const refreshed = groupReference(groupManagementStore.items, { canCreate: true, allowUnassigned: true });
	const bravo = refreshed.create!('New Platoon / Bravo Team');
	const sameAlpha = refreshed.create!('New Platoon / Alpha Team');
	parentReply.resolve(
		Response.json({ id: 'saved-platoon', name: 'New Platoon', parentId: null, depth: 1, sortOrder: 0 })
	);

	expect(await Promise.all([alpha, bravo, sameAlpha])).toMatchObject([
		{ kind: 'created', option: { id: 'saved-Alpha Team' } },
		{ kind: 'created', option: { id: 'saved-Bravo Team' } },
		{ kind: 'created', option: { id: 'saved-Alpha Team' } }
	]);
	expect(sent).toEqual([
		{ name: 'New Platoon', parentId: null },
		{ name: 'Alpha Team', parentId: 'saved-platoon' },
		{ name: 'Bravo Team', parentId: 'saved-platoon' }
	]);
});

it('creates below the longest existing export path, preserving a legacy parent name', async () => {
	groupCatalogHydration.load([{ id: 'legacy', name: 'Clinic / Lab', parentId: null, depth: 1, sortOrder: 0 }], 'org-1');
	const sent: unknown[] = [];
	vi.stubGlobal(
		'fetch',
		vi.fn(async (_url, init) => {
			const body = JSON.parse(init.body);
			sent.push(body);
			return Response.json({ ...body, id: `saved-${body.name}` });
		})
	);
	const reference = groupReference(groupManagementStore.items, { canCreate: true, allowUnassigned: true });

	expect(await reference.create!('Clinic / Lab / Alpha Team')).toMatchObject({
		kind: 'created',
		option: { id: 'saved-Alpha Team', label: 'Clinic / Lab / Alpha Team' }
	});
	expect(sent).toEqual([{ name: 'Alpha Team', parentId: 'legacy', depth: 2, sortOrder: 0 }]);
});

it('offers every colliding legacy descendant export path as ambiguous', () => {
	const groups: Group[] = [
		...tree,
		{ id: 'legacy-team', name: 'Alpha Team', parentId: 'legacy', depth: 2, sortOrder: 0 },
		{ id: 'other-team', name: 'Alpha Team', parentId: 'clinic-lab', depth: 3, sortOrder: 0 }
	];
	const reference = groupReference(groups, { canCreate: false, allowUnassigned: false });
	expect(reference.find('Clinic / Lab / Alpha Team')).toMatchObject({
		kind: 'many',
		candidates: [
			{ id: 'legacy-team', label: 'Clinic / Lab / Alpha Team' },
			{ id: 'other-team', label: 'Clinic / Lab / Alpha Team' }
		]
	});
});
