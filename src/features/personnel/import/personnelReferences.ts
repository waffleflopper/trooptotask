import type { ImportReference, ReferenceOption } from '$lib/components/patterns/import-flow';
import type { Group } from '../contracts';
import type { Personnel } from '../personnel.types';
import type { RankCatalogEntry } from '../rankCatalog';
import { groupManagementStore } from '../stores/groups.svelte';
import type { personnelImportColumns } from './personnelImportColumns';
import { compactRank, groupWords, indexByName, normalizeName, personNameKey, personOption } from './personMatching';

type Columns = typeof personnelImportColumns;

export const NEW_PERSON = 'new';
const NO_GROUP = 'no-group';
function uniqueBy<T>(items: readonly T[], value: (item: T) => string): Map<string, T | null> {
	const index = new Map<string, T | null>();
	for (const item of items) {
		const key = value(item);
		index.set(key, index.has(key) && index.get(key) !== item ? null : item);
	}
	return index;
}

export function personMatchReference(
	roster: readonly Personnel[]
): ImportReference<Columns, Personnel | typeof NEW_PERSON> & { whenMissing: 'none-is-new' } {
	const newOption: ReferenceOption<typeof NEW_PERSON> = {
		id: NEW_PERSON,
		label: 'Add as a new person',
		value: NEW_PERSON
	};
	const byName = indexByName(roster);
	return {
		label: 'person',
		reads: ['lastName', 'firstName'],
		whenMissing: 'none-is-new',
		options: [...roster.map(personOption), newOption],
		key(raw) {
			const lastName = raw.lastName?.trim();
			const firstName = raw.firstName?.trim();
			if (!lastName || !firstName) return null;
			return {
				key: [personNameKey(lastName, firstName), groupWords(raw.groupName ?? ''), compactRank(raw.rank ?? '')].join(
					'|'
				),
				display: `${lastName}, ${firstName}`
			};
		},
		find(key) {
			const parts = key.split('|');
			const rank = parts.pop();
			const group = parts.pop();
			const people = byName.get(parts.join('|')) ?? [];
			if (people.length === 0) return { kind: 'none' };
			if (people.length === 1) return { kind: 'one', option: personOption(people[0]) };
			const inGroup = group ? people.filter((person) => groupWords(person.groupName) === group) : [];
			if (inGroup.length === 1) return { kind: 'one', option: personOption(inGroup[0]) };
			const candidates = inGroup.length ? inGroup : people;
			const inRank = rank ? candidates.filter((person) => compactRank(person.rank) === rank) : [];
			return {
				kind: 'many',
				candidates: [...candidates.map(personOption), newOption],
				...(inRank.length === 1 ? { suggestion: personOption(inRank[0]) } : {})
			};
		}
	};
}

export function rankReference(catalog: readonly RankCatalogEntry[]): ImportReference<Columns, RankCatalogEntry> {
	const option = (entry: RankCatalogEntry): ReferenceOption<RankCatalogEntry> => ({
		id: entry.code,
		label: entry.code,
		hint: entry.label,
		value: entry
	});
	const active = catalog.filter((entry) => entry.state === 'active');
	const exact = new Map(catalog.map((entry) => [entry.code, entry]));
	const caseless = uniqueBy(catalog, (entry) => entry.code.toUpperCase());
	const lenient = uniqueBy(
		active.flatMap((entry) => [
			{ entry, key: compactRank(entry.code) },
			{ entry, key: compactRank(entry.label) }
		]),
		(item) => item.key
	);
	return {
		label: 'rank',
		reads: ['rank'],
		whenMissing: 'ask',
		options: active.map(option),
		key: (raw) => (raw.rank?.trim() ? { key: raw.rank.trim(), display: raw.rank.trim() } : null),
		find(key) {
			const match = exact.get(key) ?? caseless.get(key.toUpperCase());
			if (match) return { kind: 'one', option: option(match) };
			const guess = lenient.get(compactRank(key));
			return guess ? { kind: 'none', suggestion: option(guess.entry) } : { kind: 'none' };
		}
	};
}

export function groupReference(
	groups: readonly Group[],
	{ canCreate, allowUnassigned }: { canCreate: boolean; allowUnassigned: boolean }
): ImportReference<Columns, Group | null> {
	const option = (group: Group): ReferenceOption<Group> => ({ id: group.id, label: group.name, value: group });
	const byWords = uniqueBy(groups, (group) => groupWords(group.name));
	return {
		label: 'group',
		reads: ['groupName'],
		whenMissing: 'ask',
		options: [...groups.map(option), ...(allowUnassigned ? [{ id: NO_GROUP, label: 'No group', value: null }] : [])],
		key: (raw) => {
			const display = raw.groupName?.trim();
			return display ? { key: normalizeName(display), display } : null;
		},
		find(key) {
			const named = groups.filter((group) => normalizeName(group.name) === key);
			if (named.length === 1) return { kind: 'one', option: option(named[0]) };
			if (named.length > 1) return { kind: 'many', candidates: named.map(option) };
			const guess = byWords.get(groupWords(key));
			return guess ? { kind: 'none', suggestion: option(guess) } : { kind: 'none' };
		},
		create: canCreate
			? async (name) => {
					const wanted = normalizeName(name);
					const existing = groupManagementStore.items.find((group) => normalizeName(group.name) === wanted);
					const group = existing ?? (await groupManagementStore.add(name));
					return group
						? { kind: 'created', option: option(group) }
						: { kind: 'refused', message: 'Enter a group name.' };
				}
			: undefined
	};
}
