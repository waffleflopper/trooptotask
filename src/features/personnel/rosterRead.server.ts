import type { PersonnelRosterReader } from './contracts';
export function loadRosterPersonnel(
	ctx: { roster: Pick<PersonnelRosterReader, 'list'> },
	options?: Parameters<PersonnelRosterReader['list']>[0]
) {
	return ctx.roster.list(options);
}
export function countArchivedPersonnel(ctx: { roster: Pick<PersonnelRosterReader, 'countArchived'> }) {
	return ctx.roster.countArchived();
}
export function findOldestArchivedAt(ctx: { roster: Pick<PersonnelRosterReader, 'findOldestArchivedAt'> }) {
	return ctx.roster.findOldestArchivedAt();
}
