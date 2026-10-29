import type { ImportReference, ReferenceOption } from '$lib/components/patterns/import-flow';
import type { Personnel } from '../personnel.types';
import type { PersonnelDodId } from '../personnelSheetPersistence';
import { normalizeDodId } from '../dodId';
import type { PersonNameColumns } from './personnelImportColumns';

const GROUP_WORDS: Readonly<Record<string, string>> = {
	plt: 'platoon',
	pltn: 'platoon',
	sqd: 'squad',
	sec: 'section',
	sect: 'section',
	co: 'company',
	tm: 'team',
	hq: 'headquarters',
	hqs: 'headquarters',
	det: 'detachment'
};

export function normalizeName(value: string): string {
	return value
		.normalize('NFKD')
		.replace(/[̀-ͯ]/g, '')
		.toLowerCase()
		.replace(/[.']/g, '')
		.replace(/[-\s]+/g, ' ')
		.trim();
}

export function personNameKey(lastName: string, firstName: string): string {
	return `${normalizeName(lastName)}|${normalizeName(firstName).replace(/ [a-z]$/, '')}`;
}

export function compactRank(value: string): string {
	return value.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function groupWords(value: string): string {
	return normalizeName(value)
		.split(' ')
		.map((word) => GROUP_WORDS[word] ?? word)
		.join(' ');
}

export function personOption(person: Personnel): ReferenceOption<Personnel> {
	return {
		id: person.id,
		label: `${person.rank} ${person.lastName}, ${person.firstName}`.trim(),
		hint: person.groupName || 'No group',
		value: person
	};
}

export function indexByName(roster: readonly Personnel[]): ReadonlyMap<string, readonly Personnel[]> {
	const byName = new Map<string, Personnel[]>();
	for (const person of roster) {
		const key = personNameKey(person.lastName, person.firstName);
		const people = byName.get(key);
		if (people) people.push(person);
		else byName.set(key, [person]);
	}
	return byName;
}

function narrowed(people: readonly Personnel[], keep: (person: Personnel) => boolean): readonly Personnel[] {
	const kept = people.filter(keep);
	return kept.length ? kept : people;
}

export function indexByDodId(roster: readonly Personnel[], dodIds: readonly PersonnelDodId[]) {
	const active = new Map(roster.filter((person) => !person.archivedAt).map((person) => [person.id, person]));
	const byDodId = new Map<string, Personnel | null>();
	for (const { personnelId, dodId } of dodIds) {
		const person = active.get(personnelId);
		if (person) byDodId.set(dodId, byDodId.has(dodId) ? null : person);
	}
	return byDodId;
}

export function rosterPersonReference<C extends PersonNameColumns>(
	roster: readonly Personnel[],
	dodIds: readonly PersonnelDodId[] = []
): ImportReference<C, Personnel> & { required: true; whenMissing: 'ask' } {
	const byName = indexByName(roster);
	const byDodId = indexByDodId(roster, dodIds);
	return {
		label: 'person',
		reads: ['lastName', 'firstName'],
		required: true,
		whenMissing: 'ask',
		options: roster.map(personOption),
		key(raw) {
			const fields: Partial<Record<string, string>> = raw;
			const lastName = fields.lastName?.trim();
			const firstName = fields.firstName?.trim();
			if (!lastName || !firstName) return null;
			return {
				key: [
					personNameKey(lastName, firstName),
					groupWords(fields.groupName ?? ''),
					compactRank(fields.rank ?? ''),
					normalizeDodId(fields.dodId ?? '')
				].join('|'),
				display: `${lastName}, ${firstName}`
			};
		},
		find(key) {
			const parts = key.split('|');
			const dodId = parts.pop();
			const byId = dodId ? byDodId.get(dodId) : null;
			if (byId) return { kind: 'one', option: personOption(byId) };
			const rank = parts.pop();
			const group = parts.pop();
			const name = parts.join('|');
			let people = byName.get(name) ?? [];
			if (people.length === 0) return { kind: 'none' };
			if (group) people = narrowed(people, (person) => groupWords(person.groupName) === group);
			if (rank) people = narrowed(people, (person) => compactRank(person.rank) === rank);
			return people.length === 1
				? { kind: 'one', option: personOption(people[0]) }
				: { kind: 'many', candidates: people.map(personOption) };
		}
	};
}
