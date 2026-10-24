<script lang="ts">
	import { onMount } from 'svelte';
	import { Button } from '$lib/components/ui/button';
	import * as Combobox from '$lib/components/ui/combobox';
	import { DatePicker } from '$lib/components/ui/date-picker';
	import * as Field from '$lib/components/ui/field';
	import { Input } from '$lib/components/ui/input';
	import * as Table from '$lib/components/ui/table';
	import * as InlineEditRow from '$lib/components/patterns/inline-edit-row';
	import type { PersonnelPageContext } from '../../contexts/PersonnelPageContext.svelte';
	import { groupOptionsFor, rankOptionsFor } from '../../personnelDraft';
	import { groupManagementStore } from '../../stores/groups.svelte';
	import type { Personnel } from '../../personnel.types';
	import type { QuickEditSession, RosterQuickEdit } from './quickEdit.svelte';

	interface Props {
		person: Personnel;
		columnCount: number;
		ctx: PersonnelPageContext;
		edit: RosterQuickEdit;
		session: QuickEditSession;
	}

	let { person, columnCount, ctx, edit, session }: Props = $props();

	const id = (field: string) => `quick-edit-${field}-${session.personnelId}`;
	const rankOptions = $derived(rankOptionsFor(ctx.data.rankCatalog ?? [], session.opening.rank));
	const groupOptions = $derived(groupOptionsFor(groupManagementStore.items, true));
	const shownError = (field: keyof typeof session.errors) => (session.attempted ? session.errors[field] : undefined);
	const canOpenDataSheet = $derived(ctx.canOpenPersonnelDetail(person));

	onMount(() => document.getElementById(id('rank'))?.focus());
</script>

<!-- The accent rule is an inset shadow so the cell content does not shift when the editor opens. -->
<Table.Row data-roster-editor={session.personnelId} class="bg-accent/10 hover:bg-accent/10">
	<Table.Cell colspan={columnCount} class="p-0 whitespace-normal shadow-[inset_3px_0_0_0_var(--color-accent)]">
		<!-- Pinned to the visible width, as the table's own row detail is, so a scrolled narrow table keeps the form on screen. -->
		<div class="sticky left-2 w-[calc(100cqw-1rem)] min-w-0 px-4 pt-2 pb-4 md:pl-11">
			<InlineEditRow.Root
				editing
				variant="row"
				label="Quick edit {person.rank} {person.lastName}, {person.firstName}"
				pending={session.saving ? 'save' : null}
				error={session.error}
				saveDisabled={!session.dirty}
				onSave={() => void edit.save()}
				onCancel={() => edit.cancel()}
			>
				{#snippet editor()}
					<fieldset disabled={session.saving} class="grid min-w-0 gap-3">
						<div class="grid gap-3 md:flex md:flex-wrap md:items-start">
							<Field.Root class="md:w-24" data-invalid={shownError('rank') ? true : undefined}>
								<Field.Label for={id('rank')}>Rank</Field.Label>
								<Combobox.Root items={rankOptions} bind:value={session.draft.rank} label="Rank" autoHighlight>
									<Combobox.Trigger id={id('rank')} placeholder="Select rank..." aria-label="Rank" />
									<Combobox.Content>
										<Combobox.Search placeholder="Select rank..." />
										<Combobox.Empty>No ranks found.</Combobox.Empty>
										<Combobox.List />
									</Combobox.Content>
								</Combobox.Root>
								{#if shownError('rank')}<Field.Error>{shownError('rank')}</Field.Error>{/if}
							</Field.Root>
							<Field.Root class="md:w-44" data-invalid={shownError('lastName') ? true : undefined}>
								<Field.Label for={id('lastName')}>Last name</Field.Label>
								<Input id={id('lastName')} bind:value={session.draft.lastName} />
								{#if shownError('lastName')}<Field.Error>{shownError('lastName')}</Field.Error>{/if}
							</Field.Root>
							<Field.Root class="md:w-40" data-invalid={shownError('firstName') ? true : undefined}>
								<Field.Label for={id('firstName')}>First name</Field.Label>
								<Input id={id('firstName')} bind:value={session.draft.firstName} />
								{#if shownError('firstName')}<Field.Error>{shownError('firstName')}</Field.Error>{/if}
							</Field.Root>
							<Field.Root class="md:w-24">
								<Field.Label for={id('mos')}>MOS</Field.Label>
								<Input id={id('mos')} bind:value={session.draft.mos} />
							</Field.Root>
							<Field.Root class="md:min-w-48 md:flex-1">
								<Field.Label for={id('clinicRole')}>Duty role</Field.Label>
								<Input id={id('clinicRole')} bind:value={session.draft.clinicRole} />
							</Field.Root>
							<Field.Root class="md:w-44">
								<Field.Label for={id('groupId')}>Group</Field.Label>
								<Combobox.Root items={groupOptions} bind:value={session.draft.groupId} label="Group" autoHighlight>
									<Combobox.Trigger id={id('groupId')} clearable placeholder="No Group Assigned" aria-label="Group" />
									<Combobox.Content>
										<Combobox.Search placeholder="Search Groups..." />
										<Combobox.Empty>No groups found.</Combobox.Empty>
										<Combobox.List />
									</Combobox.Content>
								</Combobox.Root>
							</Field.Root>
						</div>
						<div class="grid gap-3 md:flex md:flex-wrap md:items-start">
							<Field.Root class="md:w-40">
								<Field.Label for={id('ets')}>ETS</Field.Label>
								<DatePicker id={id('ets')} bind:value={session.draft.ets} placeholder="None" />
							</Field.Root>
							<Field.Root class="md:w-40">
								<Field.Label for={id('deros')}>PCS / DEROS</Field.Label>
								<DatePicker id={id('deros')} bind:value={session.draft.deros} placeholder="None" />
							</Field.Root>
						</div>
					</fieldset>
				{/snippet}
				{#snippet lead()}
					<div class="grid min-w-0 gap-0.5" aria-live="polite">
						{#if session.dirty}
							<span class="font-mono text-[11px] tracking-[0.08em] text-accent-text uppercase">
								{session.changes.length}
								{session.changes.length === 1 ? 'change' : 'changes'}
							</span>
							<span class="text-[13px] text-muted-foreground">
								{session.changes.map((change) => `${change.label} ${change.from} → ${change.to}`).join(' · ')}
							</span>
						{:else}
							<span class="text-[13px] text-muted-foreground">No changes</span>
						{/if}
					</div>
				{/snippet}
				{#snippet actions()}
					{#if canOpenDataSheet}
						<Button type="button" variant="link" size="sm" onclick={() => edit.openDataSheet()}>Full data sheet</Button>
					{/if}
				{/snippet}
			</InlineEditRow.Root>
		</div>
	</Table.Cell>
</Table.Row>
