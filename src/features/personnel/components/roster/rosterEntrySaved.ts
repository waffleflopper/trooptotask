import { goto } from '$app/navigation';
import { toastStore } from '$lib/stores/toast.svelte';
import type { PersonnelPageContext } from '../../contexts/PersonnelPageContext.svelte';
import type { Personnel } from '../../personnel.types';
import { personnelRecordHref } from '../../personnelRecordHref';
import type { ComposerEntry } from '../../rosterComposer';

export function rosterEntrySaved(ctx: PersonnelPageContext, person: Personnel, entry: ComposerEntry): void {
	ctx.peek.invalidate([person.id], [entry.kind === 'follow-up' ? 'followUps' : 'note']);
	if (entry.kind === 'follow-up') void ctx.signals.refresh([person.id]);
	const subject = `${person.rank} ${person.lastName}`;
	const logHref = personnelRecordHref(ctx.orgUrlSegment, person, 'log');
	toastStore.success(
		entry.kind === 'follow-up' ? `Follow-up added for ${subject}` : `Note added for ${subject}`,
		6000,
		ctx.canOpenPersonnelDetail(person) ? { label: 'Open log', onClick: () => void goto(logHref) } : undefined
	);
}
