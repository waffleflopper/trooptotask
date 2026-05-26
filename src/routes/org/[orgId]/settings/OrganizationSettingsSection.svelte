<script lang="ts">
	import { tick } from 'svelte';
	import { enhance } from '$app/forms';
	import * as Alert from '$lib/components/ui/alert/index.js';
	import * as AppDialog from '$lib/components/ui/app-dialog/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import type { BadgeVariant } from '$lib/components/ui/badge/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Separator } from '$lib/components/ui/separator/index.js';
	import { isBillingEnabled } from '$lib/config/billing';
	import type { PlanUsageSummaryForSettings } from './settingsTypes';
	import type { OrganizationSettingsWorkspace } from './organizationSettingsWorkspaceModel';

	let {
		organization,
		form,
		nameLoading = $bindable(false),
		slugLoading = $bindable(false),
		planBadge,
		planPrice,
		planCopy,
		billingStatus,
		personnelCount,
		planUsageSummary = null,
		showProfile = true,
		showBilling = true
	} = $props<{
		organization: OrganizationSettingsWorkspace['sections']['organization'];
		form: {
			[key: string]: unknown;
			nameSuccess?: boolean;
			slugSuccess?: boolean;
			error?: string;
			slugError?: string;
		} | null;
		nameLoading?: boolean;
		slugLoading?: boolean;
		planBadge: string;
		planPrice: string;
		planCopy: string;
		billingStatus: string;
		personnelCount: string;
		planUsageSummary?: PlanUsageSummaryForSettings | null;
		showProfile?: boolean;
		showBilling?: boolean;
	}>();

	let slugFormEl = $state<HTMLFormElement | null>(null);
	let slugConfirmOpen = $state(false);
	let slugConfirmed = $state(false);
	let pendingSlugAction = $state<'update' | 'clear' | null>(null);
	let slugFormAction = $state('?/updateSlug');

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

	function usageStatusLabel(status: string): string {
		switch (status) {
			case 'over_limit':
				return 'Over limit';
			case 'limit_reached':
				return 'Limit reached';
			case 'read_only':
				return 'Read-only';
			default:
				return 'Within limit';
		}
	}

	function usageStatusVariant(status: string): BadgeVariant {
		if (status === 'over_limit') return 'destructive';
		if (status === 'limit_reached' || status === 'read_only') return 'warning';
		return 'secondary';
	}
</script>

<div class="grid gap-4">
	{#if showProfile}
		<section class="grid gap-4 rounded-lg border bg-card p-4" aria-labelledby="organization-profile-heading">
			<div class="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
				<div class="grid gap-1">
					<h3 id="organization-profile-heading" class="text-lg font-semibold tracking-tight">Organization Profile</h3>
					<p class="text-sm text-muted-foreground">Displayed across briefs, exports, and printed rosters.</p>
				</div>
			</div>
			<Separator />
			<form
				method="POST"
				action="?/updateName"
				use:enhance={() => {
					nameLoading = true;
					return async ({ update }) => {
						nameLoading = false;
						await update();
					};
				}}
			>
				{#if form?.error}<p class="text-sm text-destructive">{form.error}</p>{/if}
				<div class="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto]">
					<div class="grid gap-2">
						<Label for="name">Organization name</Label>
						<Input id="name" name="name" type="text" value={organization.name ?? ''} required maxlength={120} />
					</div>
					<div class="flex items-end gap-2">
						<Button type="submit" disabled={nameLoading || !organization.canUpdateProfile}>
							{nameLoading ? 'Saving...' : 'Update'}
						</Button>
						{#if form?.nameSuccess}
							<span class="text-sm text-success-foreground">Saved</span>
						{/if}
					</div>
				</div>
			</form>
			<form
				bind:this={slugFormEl}
				method="POST"
				action={slugFormAction}
				class="grid gap-4 rounded-md border bg-muted/30 p-3"
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
				<div class="grid gap-1">
					<p class="text-sm font-medium">Custom URL</p>
					<p class="text-sm text-muted-foreground">
						Your unit's web address. Members access the app at /org/{organization.urlSlug ?? '1-11-bde'}/calendar.
						Letters, numbers, and hyphens only.
					</p>
				</div>
				{#if form?.slugError}<p class="text-sm text-destructive">{form.slugError}</p>{/if}
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
			</form>
		</section>
	{/if}

	{#if showBilling}
		<section class="grid gap-4 rounded-lg border bg-card p-4" aria-labelledby="subscription-heading">
			<div class="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
				<div class="grid gap-1">
					<h3 id="subscription-heading" class="text-lg font-semibold tracking-tight">Subscription & Billing</h3>
					<p class="text-sm text-muted-foreground">{planCopy}</p>
				</div>
				<Badge>{planBadge} · {planPrice}</Badge>
			</div>
			<Separator />
			<div class="grid gap-4 md:grid-cols-2">
				<div>
					<p class="text-sm font-medium">Plan</p>
					<p class="text-sm text-muted-foreground">{billingStatus}</p>
					{#if isBillingEnabled}
						<Button href={`/org/${organization.urlSegment}/billing`} size="sm">Manage Billing</Button>
					{/if}
				</div>
				<div>
					<p class="text-sm font-medium">Personnel count</p>
					<p class="text-sm text-muted-foreground">{personnelCount}</p>
				</div>
			</div>
			{#if planUsageSummary}
				<Separator />
				<div class="grid gap-3">
					<div class="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
						<h4 class="text-base font-semibold tracking-tight">Plan Usage & Limits</h4>
						{#if planUsageSummary.alerts.length > 0}
							<Badge variant="warning">Action needed</Badge>
						{/if}
					</div>
					<div class="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
						{#each planUsageSummary.rows as row (row.dimension)}
							<div class="grid gap-1 rounded-md border bg-muted/30 p-3">
								<div class="flex items-start justify-between gap-2">
									<p class="text-sm font-medium">{row.label}</p>
									<Badge variant={usageStatusVariant(row.status)}>{usageStatusLabel(row.status)}</Badge>
								</div>
								<strong class="text-lg font-semibold tracking-tight">{row.used} / {row.limitLabel}</strong>
								<p class="text-xs text-muted-foreground">{row.message}</p>
								{#if row.status !== 'within_limit'}
									<p class="text-xs font-medium">{row.remediation}</p>
								{/if}
							</div>
						{/each}
					</div>
					{#if planUsageSummary.alerts.length > 0}
						<p class="text-sm font-medium">Existing data remains visible while limits are resolved.</p>
					{/if}
				</div>
			{/if}
		</section>
	{/if}
</div>

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
