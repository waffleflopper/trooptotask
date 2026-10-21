<script lang="ts">
	import { onDestroy, tick } from 'svelte';
	import ArrowUpRight from '@lucide/svelte/icons/arrow-up-right';
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import * as Alert from '$lib/components/ui/alert/index.js';
	import * as AppDialog from '$lib/components/ui/app-dialog/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import * as InputGroup from '$lib/components/ui/input-group/index.js';
	import { Skeleton } from '$lib/components/ui/skeleton/index.js';
	import * as PageShell from '$lib/components/patterns/page-shell/index.js';
	import { formatDate, formatDayMonthYear } from '$lib/utils/dates';
	import type { CalendarCounts, GeneralSettingsActionData, GeneralSettingsData } from './generalSettingsTypes';
	import { GeneralSettingsWorkspace } from './generalSettingsWorkspace.svelte';
	import { normalizeOrganizationUrlSlug, ORGANIZATION_SLUG_MAX_LENGTH } from './url';

	let { settings, form } = $props<{ settings: GeneralSettingsData; form: GeneralSettingsActionData }>();

	const organization = $derived(settings.organization);
	let undoFormEl = $state<HTMLFormElement | null>(null);
	const workspace = new GeneralSettingsWorkspace(() => undoFormEl);
	onDestroy(() => workspace.dispose());
	let slugFormEl = $state<HTMLFormElement | null>(null);
	let editButton = $state<HTMLButtonElement | null>(null);
	let nameInput = $state<HTMLInputElement | null>(null);
	let nameSaveButton = $state<HTMLButtonElement | null>(null);
	let slugInput = $state<HTMLInputElement | null>(null);
	let slugSaveButton = $state<HTMLButtonElement | null>(null);
	let slugResetButton = $state<HTMLButtonElement | null>(null);

	// A name save replaces the organization object; keying on the saved string keeps a typed address draft.
	const savedSlug = $derived(organization.urlSlug ?? '');
	let slugDraft = $derived(savedSlug);
	const slugChanged = $derived(
		!!organization.urlSlug && normalizeOrganizationUrlSlug(slugDraft) !== organization.urlSlug
	);
	const slugDescribedBy = $derived(
		['url-slug-default', slugChanged && 'url-slug-warning', form?.slugError && 'url-slug-error']
			.filter(Boolean)
			.join(' ')
	);

	async function focusAfterRender(target: () => HTMLElement | null) {
		await tick();
		target()?.focus();
	}

	function openNameEditor() {
		workspace.startNameEdit();
		void focusAfterRender(() => nameInput);
	}

	function closeNameEditor() {
		workspace.cancelNameEdit();
		void focusAfterRender(() => editButton);
	}

	$effect(() => {
		if (form?.nameSuccess) {
			workspace.nameEditing = false;
			void focusAfterRender(() => editButton);
		} else if (form?.error) {
			workspace.nameEditing = true;
			void focusAfterRender(() => nameInput);
		} else if (form?.slugError) {
			void focusAfterRender(() => slugInput);
		}
	});

	function submitName(cancel: () => void, formData: FormData, undo: boolean) {
		const settle = workspace.submitName(
			cancel,
			() => [editButton, form?.error ? nameInput : nameSaveButton, nameInput],
			{ from: organization.name, to: String(formData.get('name') ?? ''), undo }
		);
		if (settle) form = null;
		else if (!undo && !workspace.nameEditing) void focusAfterRender(() => editButton);
		return settle;
	}

	function plural(count: number, one: string, many = `${one}s`) {
		return `${count} ${count === 1 ? one : many}`;
	}

	function calendarSummary(counts: CalendarCounts) {
		return [
			plural(counts.statusTypes, 'status', 'statuses'),
			plural(counts.assignmentTypes, 'assignment type'),
			plural(counts.specialDays, 'holiday')
		].join(' · ');
	}
</script>

<PageShell.FactSection>
	<PageShell.FactRow
		variant="display"
		label="Unit name"
		labelFor={workspace.nameEditing ? 'name' : undefined}
		description="Shown on briefs, exports and printed rosters. Documents made from now on use the new name."
	>
		<form
			method="POST"
			action="?/updateName"
			class="grid gap-2.5"
			use:enhance={({ cancel, formData }) => submitName(cancel, formData, false)}
		>
			{#if workspace.nameRequestError}
				<Alert.Root variant="destructive">
					<Alert.Description>{workspace.nameRequestError}</Alert.Description>
				</Alert.Root>
			{/if}
			{#if workspace.nameEditing}
				<div class="flex flex-wrap items-start gap-2">
					<!-- Explicit IDs associate a server error in server-rendered HTML, before hydration runs. -->
					<Input
						bind:ref={nameInput}
						id="name"
						name="name"
						type="text"
						class="min-w-48 flex-1"
						value={organization.name ?? ''}
						required
						maxlength={100}
						aria-invalid={form?.error ? true : undefined}
						aria-describedby={form?.error ? 'name-error' : undefined}
					/>
					<Button
						bind:ref={nameSaveButton}
						type="submit"
						aria-disabled={workspace.nameLoading ? 'true' : undefined}
						aria-busy={workspace.nameLoading || undefined}
					>
						{workspace.nameLoading ? 'Saving...' : 'Save'}
					</Button>
					<Button type="button" variant="outline" onclick={closeNameEditor} disabled={workspace.nameLoading}>
						Cancel
					</Button>
				</div>
				{#if form?.error}
					<p id="name-error" role="alert" class="text-xs text-destructive">{form.error}</p>
				{/if}
			{:else}
				<div class="flex items-center gap-4">
					<p class="min-w-0 flex-1 font-heading text-[28px] leading-8 font-bold wrap-anywhere">
						{organization.name ?? 'Unnamed unit'}
					</p>
					<Button bind:ref={editButton} type="button" variant="outline" onclick={openNameEditor}>
						Edit <span class="sr-only">unit name</span>
					</Button>
				</div>
			{/if}
		</form>
		<form
			bind:this={undoFormEl}
			method="POST"
			action="?/updateName"
			hidden
			use:enhance={({ cancel, formData }) => submitName(cancel, formData, true)}
		>
			<input type="hidden" name="name" value={workspace.undoName} />
		</form>
		{#if settings.lastRenamed}
			{#await settings.lastRenamed}
				<Skeleton class="h-5 w-56" aria-hidden="true" />
				<span class="sr-only">Loading the last change</span>
			{:then last}
				{#if last}
					<p class="font-mono text-xs leading-5 text-muted-foreground">
						Last changed {formatDayMonthYear(formatDate(new Date(last.at)))}{last.actor ? ` · ${last.actor}` : ''}
					</p>
				{/if}
			{:catch}
				<p class="font-mono text-xs leading-5 text-muted-foreground">The last change could not be loaded.</p>
			{/await}
		{/if}
	</PageShell.FactRow>

	<PageShell.FactRow
		variant="display"
		label="Web address"
		labelFor="urlSlug"
		description="Most units leave this alone. Set one when your command wants a short path to share, like /org/1-11-bde."
	>
		<form
			bind:this={slugFormEl}
			method="POST"
			action={workspace.slugFormAction}
			class="grid gap-2.5"
			use:enhance={({ cancel }) => {
				const settle = workspace.submitSlug(
					cancel,
					(action) => () => [
						form?.slugError ? slugInput : null,
						action === 'clear' ? slugResetButton : null,
						slugSaveButton,
						slugInput
					],
					!!organization.urlSlug
				);
				if (settle) form = null;
				return settle;
			}}
		>
			{#if workspace.slugRequestError}
				<Alert.Root variant="destructive">
					<Alert.Description>{workspace.slugRequestError}</Alert.Description>
				</Alert.Root>
			{/if}
			<div class="flex items-start gap-2">
				<InputGroup.Root class="flex-1">
					<InputGroup.Input
						bind:ref={slugInput}
						bind:value={slugDraft}
						id="urlSlug"
						name="urlSlug"
						type="text"
						class="font-mono"
						placeholder="1-11-bde"
						autocomplete="off"
						aria-invalid={form?.slugError ? true : undefined}
						aria-describedby={slugDescribedBy}
						maxlength={ORGANIZATION_SLUG_MAX_LENGTH}
					/>
					<InputGroup.Addon variant="muted">
						<InputGroup.Text class="font-mono">
							<span><span class="hidden sm:inline">{page.url.host}</span>/org/</span>
						</InputGroup.Text>
					</InputGroup.Addon>
				</InputGroup.Root>
				<Button
					bind:ref={slugSaveButton}
					type="submit"
					aria-disabled={workspace.slugLoading ? 'true' : undefined}
					aria-busy={workspace.slugLoading || undefined}
				>
					{workspace.slugLoading ? 'Saving...' : 'Update'}
				</Button>
			</div>
			<div class="grid justify-items-start font-mono text-xs leading-5 text-muted-foreground">
				<span id="url-slug-default">Default /org/{organization.id}</span>
				{#if organization.urlSlug}
					<Button
						bind:ref={slugResetButton}
						type="button"
						variant="link"
						size="xs"
						class="-ml-2"
						aria-disabled={workspace.slugLoading ? 'true' : undefined}
						onclick={() => workspace.requestSlugClear()}>Reset to default</Button
					>
				{/if}
			</div>
			{#if form?.slugError}
				<p id="url-slug-error" role="alert" class="text-xs text-destructive">{form.slugError}</p>
			{/if}
			{#if slugChanged}
				<Alert.Root id="url-slug-warning" variant="warning" role="status">
					<Alert.Description>
						Changing it breaks saved bookmarks and shared links to /org/{organization.urlSlug}. Tell the unit before you
						switch.
					</Alert.Description>
				</Alert.Root>
			{/if}
		</form>
	</PageShell.FactRow>

	<PageShell.FactRow
		variant="display"
		label="Calendar"
		description="Status types, assignment types and holidays live with the calendar, next to where they are used."
	>
		<div class="flex flex-wrap items-center gap-x-1.5 gap-y-2">
			{#await settings.calendarCounts}
				<div class="min-w-0 flex-1">
					<Skeleton class="h-5 w-72 max-w-full" aria-hidden="true" />
					<span class="sr-only">Loading Calendar counts</span>
				</div>
			{:then counts}
				<p class="min-w-0 flex-1 font-mono text-xs leading-5 text-muted-foreground">{calendarSummary(counts)}</p>
			{:catch}
				<p class="min-w-0 flex-1 font-mono text-xs leading-5 text-muted-foreground">
					Calendar counts could not be loaded.
				</p>
			{/await}
			<Button variant="link" class="-mr-2" href={`/org/${organization.urlSegment}/calendar/settings`}>
				Calendar settings
				<ArrowUpRight data-icon="inline-end" aria-hidden="true" />
			</Button>
		</div>
	</PageShell.FactRow>
</PageShell.FactSection>

<AppDialog.Root bind:open={workspace.slugConfirmOpen} onClose={() => workspace.cancelSlugAction()}>
	<AppDialog.Content>
		<AppDialog.Header>
			<AppDialog.Title>
				{workspace.pendingSlugAction === 'clear' ? 'Reset the web address?' : 'Update the web address?'}
			</AppDialog.Title>
			<AppDialog.Description>
				{#if workspace.pendingSlugAction === 'clear'}
					The unit goes back to its default address. Existing bookmarks and shared links using /org/{organization.urlSlug}/
					will stop working.
				{:else if organization.urlSlug}
					Changing the web address affects every bookmarked link and shared URL for this unit. Members will need to
					update their bookmarks.
				{:else}
					The default address keeps working. Share the new path when you want a shorter link.
				{/if}
			</AppDialog.Description>
		</AppDialog.Header>
		<AppDialog.Footer>
			<Button type="button" variant="outline" onclick={() => workspace.cancelSlugAction()}>Cancel</Button>
			<Button type="button" onclick={() => workspace.confirmSlugAction(slugFormEl)}>
				{workspace.pendingSlugAction === 'clear' ? 'Reset address' : 'Update address'}
			</Button>
		</AppDialog.Footer>
	</AppDialog.Content>
</AppDialog.Root>
