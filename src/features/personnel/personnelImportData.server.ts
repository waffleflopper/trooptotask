import type { Personnel, PersonnelRosterReader } from './contracts';
import type { PersonnelDodId, PersonnelSheetPersistence } from './personnelSheetPersistence';

export interface PersonnelImportData {
	dodIds: PersonnelDodId[];
	archived: Personnel[];
}

/** What the import needs beyond the roster: who holds each DoD ID, and who is archived and so may be restored. */
export async function loadPersonnelImportData(ctx: {
	personnelSheets: Pick<PersonnelSheetPersistence, 'listDodIds'>;
	roster: Pick<PersonnelRosterReader, 'list'>;
}): Promise<PersonnelImportData> {
	const [dodIds, archived] = await Promise.all([
		ctx.personnelSheets.listDodIds(),
		ctx.roster.list({ status: 'archived' })
	]);
	return {
		dodIds,
		archived: archived.map(
			({ id, rank, lastName, firstName, mos, clinicRole, ets, deros, groupId, groupName, archivedAt }): Personnel => ({
				id,
				rank,
				lastName,
				firstName,
				mos,
				clinicRole,
				ets,
				deros,
				groupId,
				groupName,
				archivedAt
			})
		)
	};
}
