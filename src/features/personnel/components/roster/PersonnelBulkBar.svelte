<script lang="ts">
	import { invalidate } from '$app/navigation';
	import ArchiveIcon from '@lucide/svelte/icons/archive';
	import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';
	import DownloadIcon from '@lucide/svelte/icons/download';
	import FolderInputIcon from '@lucide/svelte/icons/folder-input';
	import MessageSquarePlusIcon from '@lucide/svelte/icons/message-square-plus';
	import SquareCheckIcon from '@lucide/svelte/icons/square-check';
	import XIcon from '@lucide/svelte/icons/x';
	import { Button } from '$lib/components/ui/button';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import { stillInOrganizationLifetime, withinOrganizationLifetime } from '$lib/stores/core';
	import { toastStore } from '$lib/stores/toast.svelte';
	import type { PersonnelPageContext } from '../../contexts/PersonnelPageContext.svelte';
	import type { Personnel } from '../../personnel.types';
	import type { ComposerKind } from '../../rosterComposer';
	import { downloadRosterExport, rosterExportFilename, rosterExportRows } from '../../rosterExport';
	import { personnelStore } from '../../stores/personnel.svelte';
	import { moveGroupMembers } from '../../utils/moveGroupMembers';

	interface Props {
		ctx: PersonnelPageContext;
		/** Everyone selected who is still on the active roster, shown or not. */
		people: readonly Personnel[];
		/** How many of `people` the search hides. */
		hidden: number;
		oncompose: (kind: ComposerKind) => void;
		onclear: () => void;
		/** People who left the active roster or went for approval, to drop from the selection. */
		onarchived: (result: { archivedIds: string[]; approvalRequestedIds: string[] }) => void;
		/**
		 * Whether the roster that started work for `orgId` is still showing it. The bar unmounts as soon as its
		 * selection empties, so it cannot answer this itself.
		 */
		isCurrent: (orgId: string) => boolean;
	}

	let { ctx, people, hidden, oncompose, onclear, onarchived, isCurrent: rosterIsCurrent }: Props = $props();

	let busy = $state(false);
	let confirmingArchive = $state(false);

	const writable = $derived(people.filter((person) => ctx.canManagePersonnelRecord(person)));
	const exportable = $derived(people.filter((person) => ctx.canExportPersonnelRecord(person)));
	const archivable = $derived(people.filter((person) => ctx.canArchivePersonnelRecord(person)));
	const moveTargets = $derived([
		...ctx.groupOrder.flatMap((name) => {
			const id = ctx.groupIdForName(name);
			return id && ctx.canManagePersonnelInGroup(id) ? [{ id, name }] : [];
		}),
		...(ctx.canManagePersonnelInGroup(null) ? [{ id: null, name: 'Unassigned' }] : [])
	]);

	const count = (n: number) => `${n} ${n === 1 ? 'person' : 'people'}`;
	const skippedNote = (n: number) => (n > 0 ? ` · ${count(n)} skipped` : '');

	async function moveTo(target: { id: string | null; name: string }): Promise<void> {
		const orgId = ctx.orgId;
		const ids = writable.map((person) => person.id);
		const inLifetime = stillInOrganizationLifetime();
		const isCurrent = () => inLifetime() && rosterIsCurrent(orgId);
		busy = true;
		try {
			const result = await withinOrganizationLifetime(moveGroupMembers(orgId, ids, target.id), isCurrent);
			const moved = new Set(result.movedIds);
			// A Group decides which requirements apply, so the People who changed Group get their signals reread.
			const changed = writable.filter((person) => moved.has(person.id) && person.groupId !== target.id);
			if (changed.length) void ctx.signals.refresh(changed.map((person) => person.id));
			personnelStore.updateLocalWhere(
				(person) => moved.has(person.id) && person.groupId !== target.id,
				(person) => ({ ...person, groupId: target.id, groupName: target.id ? target.name : '' })
			);
			const skipped = people.length - result.movedIds.length;
			toastStore.success(`Moved ${count(result.movedIds.length)} to ${target.name}${skippedNote(skipped)}`);
		} catch (caught) {
			if (isCurrent()) toastStore.error(caught instanceof Error ? caught.message : 'Unable to move People.');
		} finally {
			if (isCurrent()) busy = false;
		}
	}

	async function exportSelected(): Promise<void> {
		const rows = rosterExportRows(exportable, (person) => ctx.signalRow(person), ctx.signals.statusTypes);
		const filename = rosterExportFilename(ctx.orgUrlSegment, ctx.data.asOf);
		busy = true;
		try {
			await downloadRosterExport(filename, rows);
			const skipped = people.length - exportable.length;
			if (skipped > 0) toastStore.info(`Exported ${count(exportable.length)}${skippedNote(skipped)}`);
		} catch {
			toastStore.error('The export could not be created. Try again.');
		} finally {
			busy = false;
		}
	}

	async function archiveSelected(): Promise<void> {
		const orgId = ctx.orgId;
		const ids = archivable.map((person) => person.id);
		const skipped = people.length - ids.length;
		const inLifetime = stillInOrganizationLifetime();
		const isCurrent = () => inLifetime() && rosterIsCurrent(orgId);
		busy = true;
		try {
			const { bulkArchivePersonnel } = await import('../../utils/bulkArchivePersonnel');
			if (!isCurrent()) return;
			const result = await bulkArchivePersonnel(orgId, ids);
			if (!isCurrent()) return;
			confirmingArchive = false;
			onarchived(result);

			if (result.archivedIds.length > 0) toastStore.success(`${result.archivedIds.length} personnel archived`);
			if (result.approvalRequestedIds.length > 0) {
				toastStore.info(`${result.approvalRequestedIds.length} archival requests submitted for admin approval.`);
			}
			if (result.errors.length > 0) {
				toastStore.error(`${result.errors.length} personnel could not be archived. Retry the selected personnel.`);
			}
			if (skipped > 0) toastStore.info(`${count(skipped)} you cannot archive were skipped.`);
			if (result.archivedIds.length > 0 || result.approvalRequestedIds.length > 0) {
				try {
					await invalidate('app:personnel-data');
				} catch {
					if (isCurrent())
						toastStore.warning(
							'Archive results were saved, but the roster could not be refreshed. Refresh to check the latest roster.'
						);
				}
			}
		} catch {
			if (isCurrent()) {
				confirmingArchive = false;
				toastStore.error(
					'Archive results could not be confirmed. Refresh to check the roster, then retry the selected personnel if needed.'
				);
			}
		} finally {
			if (isCurrent()) busy = false;
		}
	}

	const archiveMessage = $derived(
		[
			`Archive ${archivable.length} personnel? They will leave active rosters, calendars, and reports. Records are not erased, and some archives may require approval.`,
			hidden > 0 && `This includes ${count(hidden)} your search hides.`,
			people.length > archivable.length &&
				`${count(people.length - archivable.length)} you cannot archive will be skipped.`
		]
			.filter(Boolean)
			.join(' ')
	);
</script>

<div
	role="toolbar"
	aria-label="Selected people"
	data-roster-bulk-bar
	class="flex h-13 max-w-full items-center gap-1.5 rounded-md border border-chrome-border bg-chrome pr-2 pl-4.5 text-chrome-text shadow-xl @max-3xl/roster:gap-0.5 @max-3xl/roster:pl-3"
>
	<span class="pr-1.5 text-[15px] leading-[18px] font-semibold whitespace-nowrap" aria-live="polite">
		{people.length} selected
		{#if hidden > 0}
			<span class="font-normal text-chrome-text-muted">
				{`· ${hidden} hidden`}<span class="@max-3xl/roster:sr-only">{' by search'}</span>
			</span>
		{/if}
	</span>
	<span class="h-5.5 w-px shrink-0 bg-chrome-border" aria-hidden="true"></span>
	{#if writable.length > 0}
		<Button
			type="button"
			variant="accent"
			size="lg"
			disabled={busy}
			title="Follow-up for each"
			onclick={() => oncompose('follow-up')}
		>
			<SquareCheckIcon aria-hidden="true" /><span class="@max-3xl/roster:sr-only">Follow-up for each</span>
		</Button>
		<Button type="button" variant="ghost" size="lg" disabled={busy} title="Add note" onclick={() => oncompose('note')}>
			<MessageSquarePlusIcon class="@3xl/roster:hidden" aria-hidden="true" /><span class="@max-3xl/roster:sr-only"
				>Add note</span
			>
		</Button>
		{#if moveTargets.length > 0}
			<DropdownMenu.Root>
				<DropdownMenu.Trigger disabled={busy}>
					{#snippet child({ props })}
						<Button {...props} type="button" variant="ghost" size="lg" title="Move to Group">
							<FolderInputIcon class="@3xl/roster:hidden" aria-hidden="true" /><span class="@max-3xl/roster:sr-only"
								>Move to Group</span
							><ChevronDownIcon class="size-3 @max-3xl/roster:hidden" aria-hidden="true" />
						</Button>
					{/snippet}
				</DropdownMenu.Trigger>
				<DropdownMenu.Content side="top" align="start" class="max-h-80">
					<DropdownMenu.Label>Move {count(writable.length)} to</DropdownMenu.Label>
					{#each moveTargets as target (target.id ?? '')}
						<DropdownMenu.Item onSelect={() => void moveTo(target)}>{target.name}</DropdownMenu.Item>
					{/each}
				</DropdownMenu.Content>
			</DropdownMenu.Root>
		{/if}
	{/if}
	{#if exportable.length > 0}
		<Button type="button" variant="ghost" size="lg" disabled={busy} title="Export" onclick={exportSelected}>
			<DownloadIcon class="@3xl/roster:hidden" aria-hidden="true" /><span class="@max-3xl/roster:sr-only">Export</span>
		</Button>
	{/if}
	{#if archivable.length > 0}
		<Button
			type="button"
			variant="ghost"
			size="lg"
			class="ml-2 @max-3xl/roster:ml-0"
			disabled={busy}
			title="Archive…"
			onclick={() => (confirmingArchive = true)}
		>
			<ArchiveIcon class="@3xl/roster:hidden" aria-hidden="true" /><span class="@max-3xl/roster:sr-only">Archive…</span>
		</Button>
	{/if}
	<span class="h-5.5 w-px shrink-0 bg-chrome-border" aria-hidden="true"></span>
	<Button
		type="button"
		variant="ghost"
		size="icon-lg"
		aria-label="Clear selection"
		title="Clear selection (Esc)"
		onclick={onclear}
	>
		<XIcon class="text-chrome-text-muted" aria-hidden="true" />
	</Button>
</div>

{#if confirmingArchive}
	{#await import('$lib/components/ui/confirm-dialog') then { ConfirmDialog }}
		<ConfirmDialog
			title="Archive Personnel"
			message={archiveMessage}
			confirmLabel="Archive"
			variant="default"
			loading={busy}
			onConfirm={archiveSelected}
			onCancel={() => (confirmingArchive = false)}
		/>
	{/await}
{/if}
