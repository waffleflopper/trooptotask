<script lang="ts">
	import { onDestroy, tick } from 'svelte';
	import { enhance } from '$app/forms';
	import * as Alert from '$lib/components/ui/alert/index.js';
	import * as AppDialog from '$lib/components/ui/app-dialog/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Field from '$lib/components/ui/field/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Separator } from '$lib/components/ui/separator/index.js';
	import type { SettingsOrganizationSectionData, GeneralSettingsActionData } from './generalSettingsTypes';
	import { GeneralSettingsWorkspace } from './generalSettingsWorkspace.svelte';
	import { ORGANIZATION_SLUG_MAX_LENGTH } from './url';

	let { organization, form } = $props<{
		organization: SettingsOrganizationSectionData;
		form: GeneralSettingsActionData;
	}>();
	const workspace = new GeneralSettingsWorkspace();
	onDestroy(() => workspace.dispose());
	let nameFormEl = $state<HTMLFormElement | null>(null);
	let slugFormEl = $state<HTMLFormElement | null>(null);
	let editButton = $state<HTMLButtonElement | null>(null);
	let nameInput = $state<HTMLInputElement | null>(null);
	let slugInput = $state<HTMLInputElement | null>(null);

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
</script>

<div class="grid gap-4">
	<section class="grid gap-4 rounded-lg border bg-card p-4" aria-labelledby="organization-profile-heading">
		<div class="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
			<div class="grid gap-1">
				<h2 id="organization-profile-heading" class="font-heading text-lg font-semibold tracking-tight">
					Organization Profile
				</h2>
				<p class="text-sm text-muted-foreground">Displayed across briefs, exports, and printed rosters.</p>
			</div>
		</div>
		<Separator />
		<form
			bind:this={nameFormEl}
			method="POST"
			action="?/updateName"
			use:enhance={({ cancel }) => workspace.submitName(cancel)}
		>
			{#if form?.nameSuccess}
				<Alert.Root variant="success" role="status" class="mb-3">
					<Alert.Description>Organization name updated.</Alert.Description>
				</Alert.Root>
			{/if}
			{#if workspace.nameEditing}
				<div class="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto_auto]">
					<!-- Explicit IDs associate a server error in server-rendered HTML, before Field registration runs. -->
					<Field.Root data-invalid={form?.error ? true : undefined}>
						<Field.Label for="name">Organization name</Field.Label>
						<Field.Control>
							<Input
								bind:ref={nameInput}
								id="name"
								name="name"
								type="text"
								value={organization.name ?? ''}
								required
								maxlength={100}
								aria-invalid={form?.error ? true : undefined}
								aria-describedby={form?.error ? 'organization-name-error' : undefined}
							/>
						</Field.Control>
						{#if form?.error}
							<Field.Error id="organization-name-error">{form.error}</Field.Error>
						{/if}
					</Field.Root>
					<div class="flex items-end">
						<Button type="submit" disabled={workspace.nameLoading || !organization.canUpdateProfile}>
							{workspace.nameLoading ? 'Saving...' : 'Save'}
						</Button>
					</div>
					<div class="flex items-end">
						<Button type="button" variant="outline" onclick={closeNameEditor} disabled={workspace.nameLoading}
							>Cancel</Button
						>
					</div>
				</div>
			{:else}
				<div class="flex items-center justify-between gap-4">
					<div class="grid gap-1">
						<p class="text-sm font-medium text-muted-foreground">Organization name</p>
						<p class="text-base font-medium">{organization.name ?? 'Unnamed organization'}</p>
					</div>
					{#if organization.canUpdateProfile}
						<Button bind:ref={editButton} type="button" variant="outline" size="sm" onclick={openNameEditor}>
							Edit <span class="sr-only">organization name</span>
						</Button>
					{/if}
				</div>
			{/if}
		</form>
		<Separator />
		<form
			bind:this={slugFormEl}
			method="POST"
			action={workspace.slugFormAction}
			use:enhance={({ cancel }) => workspace.submitSlug(cancel)}
		>
			<div class="grid gap-3">
				<div class="grid gap-1">
					<p class="text-sm font-medium">Custom URL</p>
					<p class="text-sm text-muted-foreground">
						Your unit's web address. Most units leave this blank. Set this if your command wants a memorable path like
						/org/1-11-bde/calendar.
					</p>
				</div>
				{#if form?.slugSuccess}
					<Alert.Root variant="success">
						<Alert.Description
							>Custom URL updated. Bookmarks and shared links using the old URL will need updating.</Alert.Description
						>
					</Alert.Root>
				{/if}
				<div class="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto_auto]">
					<Field.Root data-invalid={form?.slugError ? true : undefined}>
						<Field.Label for="urlSlug">Custom path</Field.Label>
						<Field.Control>
							<Input
								bind:ref={slugInput}
								id="urlSlug"
								name="urlSlug"
								type="text"
								value={organization.urlSlug ?? ''}
								placeholder="1-11-bde"
								autocomplete="off"
								aria-invalid={form?.slugError ? true : undefined}
								aria-describedby={form?.slugError ? 'url-slug-help url-slug-error' : 'url-slug-help'}
								maxlength={ORGANIZATION_SLUG_MAX_LENGTH}
							/>
						</Field.Control>
						<Field.Description id="url-slug-help">Current app path: /org/{organization.urlSegment}</Field.Description>
						{#if form?.slugError}
							<Field.Error id="url-slug-error">{form.slugError}</Field.Error>
						{/if}
					</Field.Root>
					<div class="flex items-end">
						<Button type="submit" disabled={workspace.slugLoading || !organization.canUpdateUrlSlug}>
							{workspace.slugLoading ? 'Saving...' : organization.urlSlug ? 'Update URL' : 'Set URL'}
						</Button>
					</div>
					{#if organization.urlSlug}
						<div class="flex items-end">
							<Button
								type="button"
								variant="outline"
								disabled={workspace.slugLoading || !organization.canUpdateUrlSlug}
								onclick={() => workspace.requestSlugClear()}>Reset to default</Button
							>
						</div>
					{/if}
				</div>
			</div>
		</form>
	</section>
</div>

<AppDialog.Root bind:open={workspace.nameConfirmOpen} onClose={() => workspace.cancelNameSave()}>
	<AppDialog.Content>
		<AppDialog.Header>
			<AppDialog.Title>Update organization name?</AppDialog.Title>
			<AppDialog.Description>
				This name appears on briefs, exports, and printed rosters. Changing it will update all generated documents going
				forward.
			</AppDialog.Description>
		</AppDialog.Header>
		<AppDialog.Footer>
			<Button type="button" variant="outline" onclick={() => workspace.cancelNameSave()}>Cancel</Button>
			<Button type="button" onclick={() => workspace.confirmNameSave(nameFormEl)}>Update Name</Button>
		</AppDialog.Footer>
	</AppDialog.Content>
</AppDialog.Root>

<AppDialog.Root bind:open={workspace.slugConfirmOpen} onClose={() => workspace.cancelSlugAction()}>
	<AppDialog.Content>
		<AppDialog.Header>
			<AppDialog.Title>
				{workspace.pendingSlugAction === 'clear' ? 'Reset custom URL?' : 'Update custom URL?'}
			</AppDialog.Title>
			<AppDialog.Description>
				{#if workspace.pendingSlugAction === 'clear'}
					Removing the custom URL resets this organization's web address to the default. Existing bookmarks and shared
					links using /org/{organization.urlSlug}/ will stop working.
				{:else}
					Changing the custom URL affects every bookmarked link and shared URL for this organization. Members will need
					to update their bookmarks.
				{/if}
			</AppDialog.Description>
		</AppDialog.Header>
		<AppDialog.Footer>
			<Button type="button" variant="outline" onclick={() => workspace.cancelSlugAction()}>Cancel</Button>
			<Button type="button" onclick={() => workspace.confirmSlugAction(slugFormEl)}>
				{workspace.pendingSlugAction === 'clear' ? 'Reset URL' : 'Update URL'}
			</Button>
		</AppDialog.Footer>
	</AppDialog.Content>
</AppDialog.Root>
