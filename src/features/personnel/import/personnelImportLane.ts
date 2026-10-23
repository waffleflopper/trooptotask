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
import type { PersonnelImportRecordsChanges, PersonnelImportRecordsRecord } from '../personnelImportRecords.contracts';
import type { RankCatalogEntry } from '../rankCatalog';
import { lastFirstSplitter, personnelImportColumns as columns } from './personnelImportColumns';
import { personNameKey } from './personMatching';
import { groupReference, NEW_PERSON, personMatchReference, rankReference } from './personnelReferences';

export interface PersonnelImportSource {
	orgId: string;
	orgUrlSegment: string;
	personnel: readonly Personnel[];
	groups: readonly Group[];
	rankCatalog: readonly RankCatalogEntry[];
	canManageGroups: boolean;
	allowUnassigned: boolean;
}

const replySchema = z.object({
	created: z.array(z.unknown()),
	updated: z.array(z.unknown()),
	errors: z.array(z.object({ index: z.number().int(), message: z.string() }))
});

type UpdatableField = keyof PersonnelImportRecordsChanges;
const FIELD_LABELS: Record<UpdatableField, string> = {
	rank: columns.rank.label,
	mos: columns.mos.label,
	clinicRole: columns.clinicRole.label,
	groupId: columns.groupName.label,
	ets: columns.ets.label,
	deros: columns.deros.label
};

async function commitChunk(orgId: string, records: readonly PersonnelImportRecordsRecord[]): Promise<ChunkReply> {
	const reply = await postImportChunk(
		`/org/${orgId}/api/personnel/import`,
		{ records },
		{ fallbackMessage: 'These people could not be imported.', schema: replySchema }
	);
	if (reply.kind !== 'saved') return reply;
	const failures = new Map(reply.data.errors.map((error) => [error.index, error.message]));
	return {
		kind: 'saved',
		results: records.map((record, index): RowCommitResult => {
			const reason = failures.get(index);
			if (reason !== undefined) return { kind: 'failed', reason };
			return { kind: record.op === 'create' ? 'added' : 'updated' };
		})
	};
}

export function createPersonnelImportLane(source: PersonnelImportSource) {
	const groupNames = new Map(source.groups.map((group) => [group.id, group.name]));
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
			person: personMatchReference(source.personnel),
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
					key: `new:${personNameKey(values.lastName, values.firstName)}|${group?.id ?? ''}|${rank.code}`,
					change: {
						op: 'create',
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
				before: shown(field, person[field] ?? null),
				after: shown(field, changes[field])
			}));
			return { outcome: 'update', key: person.id, change: { op: 'update', personnelId: person.id, changes }, diff };
		},
		commitChunk: (records) => commitChunk(source.orgId, records),
		afterCommit: () => invalidate('app:personnel-data'),
		savedIn: 'the roster',
		exit: { href: `/org/${source.orgUrlSegment}/personnel`, label: 'Open the roster' }
	});
}
