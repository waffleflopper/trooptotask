<script lang="ts">
	import { enhance } from '$app/forms';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Separator } from '$lib/components/ui/separator/index.js';
	import { isBillingEnabled } from '$lib/config/billing';

	let {
		data,
		form,
		loading = $bindable(false),
		planBadge,
		planPrice,
		planCopy,
		billingStatus,
		personnelCount
	} = $props<{
		data: {
			orgId: string;
			orgName: string | null;
			members: unknown[];
			pendingApprovalsCount: number;
			archivedPersonnel: unknown[];
			policies: { retentionMonths: number };
		};
		form: {
			[key: string]: unknown;
			nameSuccess?: boolean;
			error?: string;
		} | null;
		loading?: boolean;
		planBadge: string;
		planPrice: string;
		planCopy: string;
		billingStatus: string;
		personnelCount: string;
	}>();
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
			{#if form?.nameSuccess}<Badge variant="secondary">Saved</Badge>{/if}
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
					<Input id="name" name="name" type="text" value={data.orgName ?? ''} required />
				</div>
				<div class="flex items-end">
					<Button type="submit" disabled={loading}>
						{loading ? 'Saving...' : 'Update'}
					</Button>
				</div>
			</div>
		</form>
		<div class="grid gap-4 rounded-md border bg-muted/30 p-3 md:grid-cols-[minmax(0,1fr)_auto]">
			<div class="grid gap-1">
				<p id="short-code-label" class="text-sm font-medium">Short code</p>
				<p class="text-sm text-muted-foreground">Used in URLs and DA-form headers. 3-6 chars.</p>
			</div>
			<div class="grid gap-1">
				<Button type="button" variant="outline" disabled aria-labelledby="short-code-label short-code-value">
					<span id="short-code-value">Coming soon</span>
				</Button>
				<p class="text-sm text-muted-foreground">
					Coming soon: future organization slugs for URLs and printed headers.
				</p>
			</div>
		</div>
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
					<Button href={`/org/${data.orgId}/billing`} size="sm">Manage Billing</Button>
				{/if}
			</div>
			<div>
				<p class="text-sm font-medium">Personnel count</p>
				<p class="text-sm text-muted-foreground">{personnelCount}</p>
			</div>
		</div>
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
