import { invalidate } from '$app/navigation';
import { z } from 'zod';
import {
	defineImportLane,
	type ChunkReply,
	type FieldDiff,
	type RowCommitResult,
	type RowReview
} from '$lib/components/patterns/import-flow';
import { postImportChunk } from '$lib/utils/importChunkRequest';
import type { Group } from '../contracts';
import type { Personnel } from '../personnel.types';
import type { PersonnelDodId } from '../personnelSheetPersistence';
import { dodIdInputSchema, normalizeDodId } from '../dodId';
import {
	personnelBatchMessageSchema,
	type PersonnelImportRecordsChanges,
	type PersonnelImportRecordsRecord
} from '../personnelImportRecords.contracts';
import type { RankCatalogEntry } from '../rankCatalog';
import { lastFirstSplitter, personnelImportColumns as columns } from './personnelImportColumns';
import { personNameKey } from './personMatching';
import { groupReference, NEW_PERSON, personMatchReference, rankReference } from './personnelReferences';

export interface PersonnelImportSource {
	orgId: string;
	orgUrlSegment: string;
	personnel: readonly Personnel[];
	dodIds: readonly PersonnelDodId[];
	groups: readonly Group[];
	rankCatalog: readonly RankCatalogEntry[];
	canManageGroups: boolean;
	allowUnassigned: boolean;
}

const replySchema = z.object({
	created: z.array(z.unknown()),
	updated: z.array(z.unknown()),
	errors: z.array(personnelBatchMessageSchema)
});

type UpdatableField = keyof PersonnelImportRecordsChanges;
const FIELD_LABELS: Record<UpdatableField, string> = {
	dodId: columns.dodId.label,
	rank: columns.rank.label,
	mos: columns.mos.label,
	clinicRole: columns.clinicRole.label,
	groupId: columns.groupName.label,
	ets: columns.ets.label,
	deros: columns.deros.label
};

function newPersonKey(lastName: string, firstName: string, groupId: string | null | undefined, rank: string) {
	return `new:${personNameKey(lastName, firstName)}|${groupId ?? ''}|${rank}`;
}

const keyCounts = (keys: readonly string[]) =>
	keys.reduce((counts, key) => counts.set(key, (counts.get(key) ?? 0) + 1), new Map<string, number>());

function isSavedPerson(value: unknown): value is Personnel {
	if (typeof value !== 'object' || value === null) return false;
	const { id, rank, lastName, firstName } = value as Record<string, unknown>;
	return [id, rank, lastName, firstName].every((field) => typeof field === 'string');
}

async function commitChunk(
	orgId: string,
	records: readonly PersonnelImportRecordsRecord[],
	remember: (
		saved: readonly Personnel[],
		records: readonly PersonnelImportRecordsRecord[],
		failed: ReadonlySet<number>
	) => void
): Promise<ChunkReply> {
	const reply = await postImportChunk(
		`/org/${orgId}/api/personnel/import`,
		{ records },
		{ fallbackMessage: 'These people could not be imported.', schema: replySchema }
	);
	if (reply.kind !== 'saved') return reply;
	const failures = new Map(reply.data.errors.map((error) => [error.index, error]));
	remember([...reply.data.created, ...reply.data.updated].filter(isSavedPerson), records, new Set(failures.keys()));
	return {
		kind: 'saved',
		results: records.map((record, index): RowCommitResult => {
			const failure = failures.get(index);
			if (failure) return { kind: failure.kind, reason: failure.message };
			return { kind: record.op === 'create' ? 'added' : 'updated' };
		})
	};
}

export function createPersonnelImportLane(source: PersonnelImportSource) {
	const groupNames = new Map(source.groups.map((group) => [group.id, group.name]));
	const dodIds = new Map(source.dodIds.map(({ personnelId, dodId }) => [personnelId, dodId]));
	const idRows = () => [...dodIds].map(([personnelId, dodId]) => ({ personnelId, dodId }));
	let personReference = personMatchReference(source.personnel, idRows());
	let roster = source.personnel;
	const remember = (
		saved: readonly Personnel[],
		records: readonly PersonnelImportRecordsRecord[],
		failed: ReadonlySet<number>
	) => {
		const knownIds = new Set(roster.map((person) => person.id));
		const savedCreates = new Map(
			saved
				.filter((person) => !knownIds.has(person.id))
				.map((person) => [newPersonKey(person.lastName, person.firstName, person.groupId, person.rank), person.id])
		);
		// Namesakes told apart only by DoD ID cannot be paired with the saved rows; the server keeps their IDs anyway.
		const createKey = (record: Extract<PersonnelImportRecordsRecord, { op: 'create' }>) =>
			newPersonKey(record.lastName, record.firstName, record.groupId, record.rank);
		const createCounts = keyCounts(records.flatMap((record) => (record.op === 'create' ? [createKey(record)] : [])));
		for (const [index, record] of records.entries()) {
			if (failed.has(index)) continue;
			const fields = record.op === 'create' ? record : record.changes;
			const personId =
				record.op === 'update'
					? record.personnelId
					: createCounts.get(createKey(record)) === 1
						? savedCreates.get(createKey(record))
						: undefined;
			if (personId && fields.dodId) dodIds.set(personId, normalizeDodId(fields.dodId));
		}
		const savedIds = new Set(saved.map((person) => person.id));
		roster = [...roster.filter((person) => !savedIds.has(person.id)), ...saved];
		personReference = personMatchReference(roster, idRows());
	};
	return defineImportLane({
		id: 'personnel',
		noun: { one: 'person', other: 'people' },
		intro: {
			title: 'One file adds and updates',
			body: 'People already on the roster get updated. Everyone else is added. Blank cells never clear a saved value, and nobody missing from the file is touched.'
		},
		identity: {
			fields: ['lastName', 'firstName'],
			label: (raw) => [raw.lastName, raw.firstName].filter(Boolean).join(', ')
		},
		columns,
		splitters: [lastFirstSplitter<typeof columns>()],
		references: {
			get person() {
				return personReference;
			},
			rank: rankReference(source.rankCatalog),
			group: groupReference(source.groups, {
				canCreate: source.canManageGroups,
				allowUnassigned: source.allowUnassigned
			})
		},
		review({ values, refs }): RowReview<PersonnelImportRecordsRecord> {
			const rank = refs.rank?.value ?? null;
			const group = refs.group?.value;
			const person = refs.person?.value;
			const dodId = normalizeDodId(values.dodId ?? '');
			if (!dodIdInputSchema.safeParse(dodId).success)
				return { outcome: 'fix', problems: [{ field: 'dodId', message: 'Enter a 10-digit DoD ID.' }] };
			const owner = dodId ? [...dodIds].find(([, storedId]) => storedId === dodId)?.[0] : undefined;
			if (owner && (!person || person === NEW_PERSON || owner !== person.id))
				return {
					outcome: 'fix',
					problems: [{ field: 'dodId', message: 'Another Person in this Organization already has that DoD ID.' }]
				};
			if (!person || person === NEW_PERSON) {
				if (!rank)
					return { outcome: 'fix', problems: [{ field: 'rank', message: 'Rank is needed for a new person.' }] };
				if (rank.state !== 'active')
					return {
						outcome: 'fix',
						problems: [{ field: 'rank', message: `${rank.code} is retired. Choose a current rank.` }]
					};
				if (!group && !source.allowUnassigned)
					return { outcome: 'fix', problems: [{ field: 'groupName', message: 'Choose a group for a new person.' }] };
				return {
					outcome: 'new',
					key: `${newPersonKey(values.lastName, values.firstName, group?.id, rank.code)}${dodId ? `|${dodId}` : ''}`,
					change: {
						op: 'create',
						...(dodId ? { dodId } : {}),
						rank: rank.code,
						lastName: values.lastName,
						firstName: values.firstName,
						...(values.mos ? { mos: values.mos } : {}),
						...(values.clinicRole ? { clinicRole: values.clinicRole } : {}),
						...(group !== undefined ? { groupId: group?.id ?? null } : {}),
						...(values.ets ? { ets: values.ets } : {}),
						...(values.deros ? { deros: values.deros } : {})
					}
				};
			}
			const changes: PersonnelImportRecordsChanges = {};
			if (dodId && dodId !== dodIds.get(person.id)) changes.dodId = dodId;
			if (rank && rank.code.toUpperCase() !== person.rank.toUpperCase()) {
				if (rank.state !== 'active')
					return {
						outcome: 'fix',
						problems: [{ field: 'rank', message: `${rank.code} is retired. Choose a current rank.` }]
					};
				changes.rank = rank.code;
			}
			if (values.mos && values.mos !== person.mos) changes.mos = values.mos;
			if (values.clinicRole && values.clinicRole !== person.clinicRole) changes.clinicRole = values.clinicRole;
			if (group !== undefined && (group?.id ?? null) !== person.groupId) changes.groupId = group?.id ?? null;
			if (values.ets && values.ets !== (person.ets ?? null)) changes.ets = values.ets;
			if (values.deros && values.deros !== (person.deros ?? null)) changes.deros = values.deros;
			const fields = Object.keys(changes) as UpdatableField[];
			if (fields.length === 0) return { outcome: 'unchanged', key: person.id };
			const shown = (field: UpdatableField, value: string | null | undefined) =>
				(field === 'groupId' ? (value ? groupNames.get(value) : '') : value) ?? '';
			const diff: FieldDiff[] = fields.map((field) => ({
				label: FIELD_LABELS[field],
				before: shown(field, field === 'dodId' ? dodIds.get(person.id) : (person[field] ?? null)),
				after: shown(field, changes[field])
			}));
			return { outcome: 'update', key: person.id, change: { op: 'update', personnelId: person.id, changes }, diff };
		},
		commitChunk: (records) => commitChunk(source.orgId, records, remember),
		afterCommit: () => invalidate('app:personnel-data'),
		savedIn: 'the roster',
		exit: { href: `/org/${source.orgUrlSegment}/personnel`, label: 'Open the roster' }
	});
}
