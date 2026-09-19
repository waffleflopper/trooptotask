<script lang="ts">
	import { tick } from 'svelte';
	import { enhance } from '$app/forms';
	import * as Alert from '$lib/components/ui/alert/index.js';
	import * as AppDialog from '$lib/components/ui/app-dialog/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Separator } from '$lib/components/ui/separator/index.js';
	import type { SettingsOrganizationSectionData } from './settingsSectionTypes';

	let {
		organization,
		form,
		nameLoading = $bindable(false),
		slugLoading = $bindable(false)
	} = $props<{
		organization: SettingsOrganizationSectionData;
		form: {
			[key: string]: unknown;
			nameSuccess?: boolean;
			slugSuccess?: boolean;
			error?: string;
			slugError?: string;
		} | null;
		nameLoading?: boolean;
		slugLoading?: boolean;
	}>();

	let slugFormEl = $state<HTMLFormElement | null>(null);
	let slugConfirmOpen = $state(false);
	let slugConfirmed = $state(false);
	let pendingSlugAction = $state<'update' | 'clear' | null>(null);
	let slugFormAction = $state('?/updateSlug');

	let nameEditing = $state(false);
	let nameConfirmOpen = $state(false);
	let nameConfirmed = $state(false);
	let nameFormEl = $state<HTMLFormElement | null>(null);

	function startNameEdit() {
		nameEditing = true;
	}

	function cancelNameEdit() {
		nameEditing = false;
	}

	function requestNameSave() {
		nameConfirmOpen = true;
	}

	function confirmNameSave() {
		nameConfirmed = true;
		nameConfirmOpen = false;
		nameFormEl?.requestSubmit();
	}

	function cancelNameSave() {
		nameConfirmOpen = false;
	}

	function requestSlugClear() {
		pendingSlugAction = 'clear';
		slugConfirmOpen = true;
	}

	async function confirmSlugAction() {
		slugConfirmed = true;
		slugConfirmOpen = false;
		if (pendingSlugAction === 'clear') {
			slugFormAction = '?/clearSlug';
			await tick();
		}
		slugFormEl?.requestSubmit();
	}

	function cancelSlugAction() {
		slugConfirmOpen = false;
		pendingSlugAction = null;
	}

	$effect(() => {
		if (form?.nameSuccess) {
			nameEditing = false;
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
			use:enhance={(event) => {
				if (!nameConfirmed) {
					event.cancel();
					requestNameSave();
					return;
				}
				nameConfirmed = false;
				nameLoading = true;
				return async ({ update }) => {
					nameLoading = false;
					await update();
				};
			}}
		>
			{#if form?.nameSuccess}
				<Alert.Root variant="success" class="mb-3">
					<Alert.Description>Organization name updated.</Alert.Description>
				</Alert.Root>
			{/if}
			{#if form?.error}
				<Alert.Root variant="destructive" class="mb-3">
					<Alert.Description>{form.error}</Alert.Description>
				</Alert.Root>
			{/if}
			{#if nameEditing}
				<div class="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto_auto]">
					<div class="grid gap-2">
						<Label for="name">Organization name</Label>
						<Input id="name" name="name" type="text" value={organization.name ?? ''} required maxlength={120} />
					</div>
					<div class="flex items-end">
						<Button type="submit" disabled={nameLoading || !organization.canUpdateProfile}>
							{nameLoading ? 'Saving...' : 'Save'}
						</Button>
					</div>
					<div class="flex items-end">
						<Button type="button" variant="outline" onclick={cancelNameEdit} disabled={nameLoading}>Cancel</Button>
					</div>
				</div>
			{:else}
				<div class="flex items-center justify-between gap-4">
					<div class="grid gap-1">
						<p class="text-sm font-medium text-muted-foreground">Organization name</p>
						<p class="text-base font-medium">{organization.name ?? 'Unnamed organization'}</p>
					</div>
					{#if organization.canUpdateProfile}
						<Button type="button" variant="outline" size="sm" onclick={startNameEdit}>Edit</Button>
					{/if}
				</div>
			{/if}
		</form>
		<Separator />
		<form
			bind:this={slugFormEl}
			method="POST"
			action={slugFormAction}
			use:enhance={(event) => {
				if (!slugConfirmed) {
					event.cancel();
					pendingSlugAction = 'update';
					slugConfirmOpen = true;
					return;
				}
				slugConfirmed = false;
				pendingSlugAction = null;
				slugLoading = true;
				return async ({ update }) => {
					slugLoading = false;
					slugFormAction = '?/updateSlug';
					await update();
				};
			}}
		>
			<div class="grid gap-3">
				<div class="grid gap-1">
					<p class="text-sm font-medium">Custom URL</p>
					<p class="text-sm text-muted-foreground">
						Your unit's web address. Most units leave this blank. Set this if your command wants a memorable path like
						/org/1-11-bde/calendar.
					</p>
				</div>
				{#if form?.slugError}
					<Alert.Root variant="destructive">
						<Alert.Description>{form.slugError}</Alert.Description>
					</Alert.Root>
				{/if}
				{#if form?.slugSuccess}
					<Alert.Root variant="success">
						<Alert.Description
							>Custom URL updated. Bookmarks and shared links using the old URL will need updating.</Alert.Description
						>
					</Alert.Root>
				{/if}
				<div class="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto_auto]">
					<div class="grid gap-2">
						<Label for="urlSlug">Custom path</Label>
						<Input
							id="urlSlug"
							name="urlSlug"
							type="text"
							value={organization.urlSlug ?? ''}
							placeholder="1-11-bde"
							autocomplete="off"
							aria-describedby="url-slug-help"
							maxlength={60}
						/>
						<p id="url-slug-help" class="text-sm text-muted-foreground">
							Current app path: /org/{organization.urlSegment}
						</p>
					</div>
					<div class="flex items-end">
						<Button type="submit" disabled={slugLoading || !organization.canUpdateUrlSlug}>
							{slugLoading ? 'Saving...' : organization.urlSlug ? 'Update URL' : 'Set URL'}
						</Button>
					</div>
					{#if organization.urlSlug}
						<div class="flex items-end">
							<Button
								type="button"
								variant="outline"
								disabled={slugLoading || !organization.canUpdateUrlSlug}
								onclick={requestSlugClear}>Reset to default</Button
							>
						</div>
					{/if}
				</div>
			</div>
		</form>
	</section>
</div>

<AppDialog.Root bind:open={nameConfirmOpen} onClose={cancelNameSave}>
	<AppDialog.Content>
		<AppDialog.Header>
			<AppDialog.Title>Update organization name?</AppDialog.Title>
			<AppDialog.Description>
				This name appears on briefs, exports, and printed rosters. Changing it will update all generated documents going
				forward.
			</AppDialog.Description>
		</AppDialog.Header>
		<AppDialog.Footer>
			<Button type="button" variant="outline" onclick={cancelNameSave}>Cancel</Button>
			<Button type="button" onclick={confirmNameSave}>Update Name</Button>
		</AppDialog.Footer>
	</AppDialog.Content>
</AppDialog.Root>

<AppDialog.Root bind:open={slugConfirmOpen} onClose={cancelSlugAction}>
	<AppDialog.Content>
		<AppDialog.Header>
			<AppDialog.Title>
				{pendingSlugAction === 'clear' ? 'Reset custom URL?' : 'Update custom URL?'}
			</AppDialog.Title>
			<AppDialog.Description>
				{#if pendingSlugAction === 'clear'}
					Removing the custom URL resets this organization's web address to the default. Existing bookmarks and shared
					links using /org/{organization.urlSlug}/ will stop working.
				{:else}
					Changing the custom URL affects every bookmarked link and shared URL for this organization. Members will need
					to update their bookmarks.
				{/if}
			</AppDialog.Description>
		</AppDialog.Header>
		<AppDialog.Footer>
			<Button type="button" variant="outline" onclick={cancelSlugAction}>Cancel</Button>
			<Button type="button" onclick={confirmSlugAction}>
				{pendingSlugAction === 'clear' ? 'Reset URL' : 'Update URL'}
			</Button>
		</AppDialog.Footer>
	</AppDialog.Content>
</AppDialog.Root>
