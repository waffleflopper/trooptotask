<script lang="ts">
	import { enhance } from '$app/forms';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import type { BadgeVariant } from '$lib/components/ui/badge/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Separator } from '$lib/components/ui/separator/index.js';
	import { isBillingEnabled } from '$lib/config/billing';
	import type { OrganizationSettingsWorkspace } from './organizationSettingsWorkspaceModel';

	type PlanUsageSummaryForSettings = {
		rows: Array<{
			dimension: string;
			label: string;
			used: number;
			limitLabel: string;
			status: string;
			message: string;
			remediation: string;
		}>;
		alerts: Array<{
			dimension: string;
			label: string;
			message: string;
			remediation: string;
			status: string;
		}>;
	};

	let {
		organization,
		form,
		loading = $bindable(false),
		planBadge,
		planPrice,
		planCopy,
		billingStatus,
		personnelCount,
		planUsageSummary = null
	} = $props<{
		organization: OrganizationSettingsWorkspace['sections']['organization'];
		form: {
			[key: string]: unknown;
			nameSuccess?: boolean;
			slugSuccess?: boolean;
			error?: string;
			slugError?: string;
		} | null;
		loading?: boolean;
		planBadge: string;
		planPrice: string;
		planCopy: string;
		billingStatus: string;
		personnelCount: string;
		planUsageSummary?: PlanUsageSummaryForSettings | null;
	}>();

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
	<section
		class="grid gap-4 rounded-lg border bg-card p-4 text-card-foreground"
		aria-labelledby="organization-profile-heading"
	>
		<div class="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
			<div class="grid gap-1">
				<h3 id="organization-profile-heading" class="text-lg font-semibold tracking-tight">Organization Profile</h3>
				<p class="text-sm text-muted-foreground">Displayed across briefs, exports, and printed rosters.</p>
			</div>
			{#if form?.nameSuccess || form?.slugSuccess}<Badge variant="secondary">Saved</Badge>{/if}
		</div>
		<Separator />
		<form
			method="POST"
			action="?/updateName"
			use:enhance={() => {
				loading = true;
				return async ({ update }) => {
					loading = false;
					await update();
				};
			}}
		>
			{#if form?.error}<p class="text-sm text-destructive">{form.error}</p>{/if}
			<div class="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto]">
				<div class="grid gap-2">
					<Label for="name">Organization name</Label>
					<Input id="name" name="name" type="text" value={organization.name ?? ''} required />
				</div>
				<div class="flex items-end">
					<Button type="submit" disabled={loading || !organization.canUpdateProfile}>
						{loading ? 'Saving...' : 'Update'}
					</Button>
				</div>
			</div>
		</form>
		<form
			method="POST"
			action="?/updateSlug"
			class="grid gap-4 rounded-md border bg-muted/30 p-3"
			use:enhance={() => {
				loading = true;
				return async ({ update }) => {
					loading = false;
					await update();
				};
			}}
		>
			<div class="grid gap-1">
				<p class="text-sm font-medium">Organization URL slug</p>
				<p class="text-sm text-muted-foreground">
					Used in app links like /org/{organization.urlSlug ?? '1-11-bde'}/calendar. Letters, numbers, and hyphens only.
				</p>
			</div>
			{#if form?.slugError}<p class="text-sm text-destructive">{form.slugError}</p>{/if}
			<div class="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto_auto]">
				<div class="grid gap-2">
					<Label for="urlSlug">Slug</Label>
					<Input
						id="urlSlug"
						name="urlSlug"
						type="text"
						value={organization.urlSlug ?? ''}
						placeholder="1-11-bde"
						autocomplete="off"
						aria-describedby="url-slug-help"
					/>
					<p id="url-slug-help" class="text-sm text-muted-foreground">
						Current app path: /org/{organization.urlSegment}
					</p>
				</div>
				<div class="flex items-end">
					<Button type="submit" disabled={loading || !organization.canUpdateUrlSlug}>
						{loading ? 'Saving...' : organization.urlSlug ? 'Update Slug' : 'Set Slug'}
					</Button>
				</div>
				{#if organization.urlSlug}
					<div class="flex items-end">
						<Button
							type="submit"
							variant="outline"
							formaction="?/clearSlug"
							disabled={loading || !organization.canUpdateUrlSlug}>Clear</Button
						>
					</div>
				{/if}
			</div>
		</form>
	</section>

	<section class="grid gap-4 rounded-lg border bg-card p-4 text-card-foreground" aria-labelledby="subscription-heading">
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

	<section class="grid gap-4 rounded-lg border bg-card p-4 text-card-foreground" aria-labelledby="session-heading">
		<div class="grid gap-1">
			<h3 id="session-heading" class="text-lg font-semibold tracking-tight">Session</h3>
			<p class="text-sm text-muted-foreground">Sign out of this browser only. Other sessions are unaffected.</p>
		</div>
		<div class="flex flex-wrap gap-2">
			<Button href="/auth/logout" variant="outline" size="sm">Sign Out</Button>
			<Button href="/dashboard?show=all" variant="outline" size="sm">Switch Organization</Button>
		</div>
	</section>
</div>
