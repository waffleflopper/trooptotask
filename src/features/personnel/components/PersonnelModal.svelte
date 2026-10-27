<script lang="ts">
	import type { Personnel } from '../personnel.types';
	import type { RankCatalogEntry } from '$features/personnel/contracts';
	import type { Group } from '$features/personnel/contracts';
	import {
		defaultNewPersonnelRank,
		groupOptionsFor,
		nextPersonnelDraft,
		personnelDraftChanges,
		personnelDraftOf,
		personnelPayloadOf,
		personnelSaveErrorMessage,
		rankPickerOptionsFor,
		validatePersonnelDraft,
		type PersonnelDraftErrors
	} from '$features/personnel/personnelDraft';
	import { toastStore } from '$lib/stores/toast.svelte';
	import * as Alert from '$lib/components/ui/alert';
	import * as AppDialog from '$lib/components/ui/app-dialog';
	import { Button } from '$lib/components/ui/button';
	import * as Combobox from '$lib/components/ui/combobox';
	import { DatePicker } from '$lib/components/ui/date-picker';
	import * as Field from '$lib/components/ui/field';
	import { Input } from '$lib/components/ui/input';
	import CheckIcon from '@lucide/svelte/icons/check';
	import { onDestroy, tick, untrack } from 'svelte';

	interface Props {
		groups: Group[];
		allowUnassigned?: boolean;
		rankCatalog?: RankCatalogEntry[];
		organizationName?: string;
		/** Offers Add and add another. A caller that needs the one person it adds turns it off. */
		addAnother?: boolean;
		onSubmit: (data: Omit<Personnel, 'id'>) => void | Promise<void>;
		onClose: () => void;
	}

	let {
		groups,
		allowUnassigned = true,
		rankCatalog = [],
		organizationName,
		addAnother = true,
		onSubmit,
		onClose
	}: Props = $props();
	let disposed = false;
	onDestroy(() => {
		disposed = true;
	});

	type SubmitMode = 'close' | 'another';
	type FieldName = keyof PersonnelDraftErrors;

	const rankOptions = $derived(rankPickerOptionsFor(rankCatalog));
	const rankByCode = $derived(new Map(rankOptions.map((option) => [option.value, option])));
	let draft = $state(untrack(() => personnelDraftOf(null, defaultNewPersonnelRank(rankOptions))));
	let opening = $state(untrack(() => ({ ...draft })));
	let submitAttempted = $state(false);
	let isSaving = $state(false);
	let added = $state<string[]>([]);
	let failure = $state<{ who: string; message: string; mode: SubmitMode } | null>(null);
	const dirty = $derived(personnelDraftChanges(opening, draft, groups).length > 0);

	const errors = $derived(validatePersonnelDraft(draft, { allowUnassigned, groups }));
	const shownErrors = $derived<PersonnelDraftErrors>(submitAttempted ? errors : {});
	const groupOptions = $derived(groupOptionsFor(groups, allowUnassigned));
	const noGroups = $derived(groups.length === 0 && allowUnassigned);
	const kept = $derived(added.length > 0);

	const fieldIds: Record<FieldName, string> = {
		rank: 'person-rank',
		lastName: 'person-last-name',
		firstName: 'person-first-name',
		groupId: 'person-group'
	};
	// Password managers read a contact form into these fields; these attributes and ids keep them out.
	const noAutofill = {
		autocomplete: 'off',
		'data-1p-ignore': '',
		'data-lpignore': 'true',
		'data-bwignore': ''
	} as const;

	let lastNameInput = $state<HTMLInputElement | null>(null);
	let primaryButton = $state<HTMLButtonElement | null>(null);

	function who(person: { rank: string; lastName: string }) {
		return `${person.rank} ${person.lastName}`.trim();
	}

	async function submit(mode: SubmitMode) {
		if (isSaving) return;
		submitAttempted = true;
		const invalid = (Object.keys(fieldIds) as FieldName[]).find((field) => errors[field]);
		if (invalid) {
			document.getElementById(fieldIds[invalid])?.focus();
			return;
		}

		isSaving = true;
		failure = null;
		const payload = personnelPayloadOf(draft, groups);
		try {
			await onSubmit(payload);
		} catch (error) {
			if (disposed) return;
			failure = { who: who(payload), message: personnelSaveErrorMessage(error, 'The person was not saved.'), mode };
			isSaving = false;
			await tick();
			primaryButton?.focus();
			return;
		}
		if (disposed) return;
		isSaving = false;
		if (mode === 'close') {
			toastStore.success(`Added ${who(payload)}`);
			onClose();
			return;
		}
		added = [...added, who(payload)];
		draft = nextPersonnelDraft(draft);
		opening = { ...draft };
		submitAttempted = false;
		await tick();
		lastNameInput?.focus();
	}

	function handleSubmit(event: SubmitEvent) {
		event.preventDefault();
		void submit(failure?.mode ?? 'close');
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key !== 'Enter' || !(event.ctrlKey || event.metaKey) || !addAnother) return;
		event.preventDefault();
		void submit('another');
	}
</script>

{#snippet sectionLabel(id: string, name: string, required: boolean)}
	<p
		id={`person-section-${id}`}
		class="flex gap-2 font-mono text-[11px] leading-[14px] tracking-[0.08em] sm:flex-col sm:gap-1"
	>
		<span class="font-medium text-foreground">{name}</span>
		<span class={required ? 'text-accent-text' : 'text-muted-foreground'}>{required ? 'Required' : 'Optional'}</span>
	</p>
{/snippet}

{#snippet keptMark()}
	{#if kept}<span class="font-mono text-[11px] font-normal tracking-[0.04em] text-muted-foreground">· kept</span>{/if}
{/snippet}

<AppDialog.Root open voice="form" busy={isSaving} closeBlocked={dirty} {onClose}>
	<AppDialog.Content
		size="wide"
		narrow="sheet"
		onkeydown={handleKeydown}
		class="sm:max-w-[680px]"
		onOpenAutoFocus={(event: Event) => {
			event.preventDefault();
			lastNameInput?.focus();
		}}
	>
		<AppDialog.Header eyebrow={organizationName ? `Personnel · ${organizationName}` : 'Personnel'}>
			<AppDialog.Title>Add a person</AppDialog.Title>
			<AppDialog.Description>Rank and name are all you need. Everything else can wait.</AppDialog.Description>
		</AppDialog.Header>

		<AppDialog.Body class="py-0">
			<form id="personnel-form" novalidate onsubmit={handleSubmit}>
				{#if failure}
					<Alert.Root
						variant="destructive"
						class="mt-5"
						{@attach (alert) => alert.scrollIntoView({ block: 'nearest' })}
					>
						<Alert.Title>{failure.who} wasn't added</Alert.Title>
						<Alert.Description>{failure.message} Everything you typed is still here.</Alert.Description>
					</Alert.Root>
				{/if}
				<fieldset class="contents" disabled={isSaving}>
					<div
						role="group"
						aria-labelledby="person-section-who"
						class="grid gap-4 border-b py-5 sm:grid-cols-[132px_minmax(0,1fr)] sm:gap-6"
					>
						{@render sectionLabel('who', 'Who', true)}
						<div class="grid gap-3.5">
							<Field.Root data-invalid={shownErrors.rank ? true : undefined}>
								<Field.Label for="person-rank">Rank {@render keptMark()}</Field.Label>
								<Combobox.Root items={rankOptions} bind:value={draft.rank} label="Rank" autoHighlight>
									<Combobox.Trigger id="person-rank" placeholder="Select a rank" aria-label="Rank">
										{#snippet children([code])}
											{@const rank = rankByCode.get(code)}
											{#if code}
												<span class="flex min-w-0 items-baseline gap-3">
													<span class="w-11 shrink-0 font-mono font-medium text-foreground">{code}</span>
													<span class="min-w-0 truncate text-muted-foreground">{rank?.name}</span>
													<span class="ml-auto font-mono text-[11px] tracking-[0.08em] text-muted-foreground">
														{rank?.payGrade}
													</span>
												</span>
											{:else}
												Select a rank
											{/if}
										{/snippet}
									</Combobox.Trigger>
									<Combobox.Content>
										<Combobox.Search placeholder="Search rank or pay grade" />
										<Combobox.Empty>No active rank matches.</Combobox.Empty>
										<Combobox.List>
											{#snippet children(code)}
												{@const rank = rankByCode.get(code)}
												<Combobox.Item value={code} searchValue={`${code} ${rank?.name ?? ''} ${rank?.payGrade ?? ''}`}>
													<span class="flex min-w-0 items-baseline gap-3">
														<span class="w-11 shrink-0 font-mono font-medium">{code}</span>
														<span class="min-w-0 truncate">{rank?.name}</span>
														<span class="ml-auto font-mono text-[11px] tracking-[0.08em] text-muted-foreground">
															{rank?.payGrade}
														</span>
													</span>
												</Combobox.Item>
											{/snippet}
										</Combobox.List>
									</Combobox.Content>
								</Combobox.Root>
								{#if shownErrors.rank}<Field.Error>{shownErrors.rank}</Field.Error>{/if}
							</Field.Root>

							<div class="grid gap-3.5 sm:grid-cols-2 sm:gap-3">
								<Field.Root data-invalid={shownErrors.lastName ? true : undefined}>
									<Field.Label for="person-last-name">Last name</Field.Label>
									<Input bind:ref={lastNameInput} id="person-last-name" {...noAutofill} bind:value={draft.lastName} />
									{#if shownErrors.lastName}<Field.Error>{shownErrors.lastName}</Field.Error>{/if}
								</Field.Root>
								<Field.Root data-invalid={shownErrors.firstName ? true : undefined}>
									<Field.Label for="person-first-name">First name</Field.Label>
									<Input id="person-first-name" {...noAutofill} bind:value={draft.firstName} />
									{#if shownErrors.firstName}<Field.Error>{shownErrors.firstName}</Field.Error>{/if}
								</Field.Root>
							</div>
						</div>
					</div>

					<div
						role="group"
						aria-labelledby="person-section-job"
						class="grid gap-4 border-b py-5 sm:grid-cols-[132px_minmax(0,1fr)] sm:gap-6"
					>
						{@render sectionLabel('job', 'Job', false)}
						<div class="grid gap-3.5 sm:grid-cols-[196px_minmax(0,1fr)] sm:gap-3">
							<Field.Root>
								<Field.Label for="person-mos">MOS or job title {@render keptMark()}</Field.Label>
								<Input id="person-mos" class="font-mono" {...noAutofill} bind:value={draft.mos} />
							</Field.Root>
							<Field.Root>
								<Field.Label for="person-duty-role">Duty Role</Field.Label>
								<Input
									id="person-duty-role"
									placeholder="Supply clerk, Squad leader"
									{...noAutofill}
									bind:value={draft.clinicRole}
								/>
							</Field.Root>
						</div>
					</div>

					<div
						role="group"
						aria-labelledby="person-section-leaving"
						class="grid gap-4 border-b py-5 sm:grid-cols-[132px_minmax(0,1fr)] sm:gap-6"
					>
						{@render sectionLabel('leaving', 'Leaving', false)}
						<div class="grid gap-2">
							<div class="grid grid-cols-2 gap-3">
								<Field.Root>
									<Field.Label for="person-ets">ETS</Field.Label>
									<DatePicker id="person-ets" bind:value={draft.ets} placeholder="Not set" />
								</Field.Root>
								<Field.Root>
									<Field.Label for="person-deros">PCS or DEROS</Field.Label>
									<DatePicker id="person-deros" bind:value={draft.deros} placeholder="Not set" />
								</Field.Root>
							</div>
							<p class="text-[13px] leading-[18px] text-muted-foreground">
								Feeds Losses and awards. Leave blank if you don't know yet.
							</p>
						</div>
					</div>

					<div
						role="group"
						aria-labelledby="person-section-placement"
						class="grid gap-4 py-5 sm:grid-cols-[132px_minmax(0,1fr)] sm:gap-6"
					>
						{@render sectionLabel('placement', 'Placement', false)}
						{#if noGroups}
							<div class="grid gap-1.5">
								<p class="text-sm leading-[18px] font-medium">Group</p>
								<div class="rounded-md border border-dashed bg-muted px-3.5 py-3 text-sm">
									<p class="font-medium">No Groups yet</p>
									<p class="text-muted-foreground">
										Everyone starts unassigned. Sort people into Groups once you make them.
									</p>
								</div>
							</div>
						{:else}
							<Field.Root data-invalid={shownErrors.groupId ? true : undefined}>
								<Field.Label for="person-group">Group {@render keptMark()}</Field.Label>
								<Combobox.Root items={groupOptions} bind:value={draft.groupId} label="Group" autoHighlight>
									<Combobox.Trigger
										id="person-group"
										clearable={allowUnassigned}
										placeholder={allowUnassigned ? 'No Group Assigned' : 'Select a Group'}
										aria-label="Group"
									/>
									<Combobox.Content>
										<Combobox.Search placeholder="Search Groups" />
										<Combobox.Empty>No Group matches.</Combobox.Empty>
										<Combobox.List />
									</Combobox.Content>
								</Combobox.Root>
								{#if shownErrors.groupId}<Field.Error>{shownErrors.groupId}</Field.Error>{/if}
							</Field.Root>
						{/if}
					</div>
				</fieldset>
			</form>
		</AppDialog.Body>

		<AppDialog.Footer>
			<div class="flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:gap-2.5">
				<div class="flex min-h-9 items-center gap-2 sm:grow">
					<p
						role="status"
						class="flex grow items-center gap-2 font-mono text-[11px] tracking-[0.04em] text-muted-foreground"
					>
						{#if added.length > 0}
							<CheckIcon class="size-3.5 shrink-0 text-success" aria-hidden="true" />
							Added {added.at(-1)} · {added.length} so far
						{/if}
					</p>
					<Button type="button" variant="ghost" onclick={onClose} disabled={isSaving}>
						{added.length > 0 ? 'Done' : 'Cancel'}
					</Button>
				</div>
				<div class="grid grid-cols-2 gap-2.5 sm:flex">
					{#if addAnother}
						<Button
							type="button"
							variant="outline"
							disabled={isSaving}
							aria-keyshortcuts="Control+Enter Meta+Enter"
							onclick={() => submit('another')}
						>
							<span class="sm:hidden">Add another</span>
							<span class="max-sm:hidden">Add and add another</span>
						</Button>
					{/if}
					<Button
						bind:ref={primaryButton}
						type="submit"
						form="personnel-form"
						data-testid="personnel-save"
						class={addAnother ? undefined : 'col-span-2'}
						disabled={isSaving}
					>
						{isSaving ? 'Adding...' : failure ? 'Try again' : 'Add person'}
					</Button>
				</div>
			</div>
		</AppDialog.Footer>
	</AppDialog.Content>
</AppDialog.Root>
