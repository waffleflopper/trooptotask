import type { ImportReference, ReferenceOption } from '$lib/components/patterns/import-flow';
import type { StatusType } from '../contracts';
import type { statusImportColumns } from './statusImportColumns';

function statusName(value: string): string {
	return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function abbreviates(code: string, name: string): boolean {
	const letters = code.replace(/[^a-z0-9]/g, '');
	if (!letters || letters[0] !== name[0]) return false;
	let at = 0;
	for (const letter of name) if (letter === letters[at]) at++;
	return at === letters.length;
}

function unique<T>(items: readonly T[]): T | undefined {
	return items.length === 1 ? items[0] : undefined;
}

export function statusOption(status: StatusType): ReferenceOption<StatusType> {
	return { id: status.id, label: status.name, value: status };
}

export function statusReference(
	statusTypes: readonly StatusType[],
	create?: (name: string) => Promise<StatusType | null>
): ImportReference<typeof statusImportColumns, StatusType> & { whenMissing: 'ask'; required: true } {
	const byName = new Map(statusTypes.map((status) => [statusName(status.name), status]));
	return {
		label: 'status',
		reads: ['status'],
		whenMissing: 'ask',
		required: true,
		options: statusTypes.map(statusOption),
		key: (raw) => {
			const display = raw.status?.trim();
			return display ? { key: statusName(display), display } : null;
		},
		find(key) {
			const status = byName.get(key);
			if (status) return { kind: 'one', option: statusOption(status) };
			const guess =
				unique(statusTypes.filter((type) => type.shortLabel && statusName(type.shortLabel) === key)) ??
				unique(statusTypes.filter((type) => abbreviates(key, statusName(type.name))));
			return guess ? { kind: 'none', suggestion: statusOption(guess) } : { kind: 'none' };
		},
		create: create
			? async (name) => {
					const wanted = statusName(name);
					if (!wanted) return { kind: 'refused', message: 'Enter a status name.' };
					const status = byName.get(wanted) ?? (await create(name.trim()));
					return status
						? { kind: 'created', option: statusOption(status) }
						: { kind: 'refused', message: 'Status types are being saved. Try again in a moment.' };
				}
			: undefined
	};
}
