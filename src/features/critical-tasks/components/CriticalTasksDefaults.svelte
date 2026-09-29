<script lang="ts">
	import { invalidate } from '$app/navigation';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Spinner } from '$lib/components/ui/spinner';
	import type { CriticalTasksSettings } from '../criticalTasks.types';

	let { orgId, settings }: { orgId: string; settings: CriticalTasksSettings } = $props();
	let defaultExpirationMonths = $state(12);
	let expiringSoonWarningDays = $state(60);
	let savedExpirationMonths = $state(12);
	let savedWarningDays = $state(60);
	let saving = $state(false);
	let saveError = $state('');
	let lastSettingsKey = $state('');
	let lastOrgId = $state('');
	const changed = $derived(
		defaultExpirationMonths !== savedExpirationMonths || expiringSoonWarningDays !== savedWarningDays
	);
	const valid = $derived(
		Number.isInteger(defaultExpirationMonths) &&
			defaultExpirationMonths >= 1 &&
			defaultExpirationMonths <= 120 &&
			Number.isInteger(expiringSoonWarningDays) &&
			expiringSoonWarningDays >= 1 &&
			expiringSoonWarningDays <= 365
	);

	$effect(() => {
		const key = `${settings.defaultExpirationMonths}:${settings.expiringSoonWarningDays}`;
		if (orgId === lastOrgId && (key === lastSettingsKey || (lastSettingsKey && changed))) return;
		defaultExpirationMonths = settings.defaultExpirationMonths;
		expiringSoonWarningDays = settings.expiringSoonWarningDays;
		savedExpirationMonths = settings.defaultExpirationMonths;
		savedWarningDays = settings.expiringSoonWarningDays;
		saving = false;
		saveError = '';
		lastOrgId = orgId;
		lastSettingsKey = key;
	});

	async function save() {
		if (!changed || !valid || saving) return;
		const requestOrgId = orgId;
		const submitted = { defaultExpirationMonths, expiringSoonWarningDays };
		saveError = '';
		saving = true;
		try {
			const response = await fetch(`/org/${requestOrgId}/api/critical-tasks/settings`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(submitted)
			});
			if (!response.ok) throw new Error('Critical Tasks settings save failed');
			if (orgId !== requestOrgId) return;
			savedExpirationMonths = submitted.defaultExpirationMonths;
			savedWarningDays = submitted.expiringSoonWarningDays;
			await invalidate('app:critical-tasks-data');
		} catch {
			if (orgId === requestOrgId) saveError = 'Failed to save Critical Tasks defaults';
		} finally {
			if (orgId === requestOrgId) saving = false;
		}
	}
</script>

<section
	class="grid gap-4 rounded-lg border bg-card p-5 text-card-foreground"
	aria-labelledby="critical-tasks-defaults-heading"
>
	<div class="flex flex-wrap items-start justify-between gap-3">
		<div class="grid gap-1">
			<h2 id="critical-tasks-defaults-heading" class="font-heading text-lg font-semibold tracking-tight">
				Critical Tasks Defaults
			</h2>
			<p class="text-sm text-muted-foreground">Shared expiration thresholds for the task library.</p>
		</div>
		<div class="flex items-center gap-2">
			<Badge variant={changed ? 'outline' : 'secondary'}>{changed ? 'Unsaved changes' : 'Saved'}</Badge>
			<Button size="sm" type="button" disabled={!changed || !valid || saving} onclick={save}>
				{#if saving}<Spinner />{/if}
				{saving ? 'Saving...' : 'Save'}
			</Button>
		</div>
	</div>
	<div class="grid gap-4 md:grid-cols-2">
		<div class="grid gap-2">
			<Label for="critical-tasks-default-expiration">Default expiration</Label>
			<p class="text-sm text-muted-foreground">Used when a task has no expiration override.</p>
			<div class="flex items-center gap-2">
				<Input
					id="critical-tasks-default-expiration"
					type="number"
					min="1"
					max="120"
					disabled={saving}
					bind:value={defaultExpirationMonths}
				/>
				<span class="text-sm text-muted-foreground">Months</span>
			</div>
		</div>
		<div class="grid gap-2">
			<Label for="critical-tasks-expiring-window">Expiring-soon window</Label>
			<p class="text-sm text-muted-foreground">When a current task becomes expiring soon.</p>
			<div class="flex items-center gap-2">
				<Input
					id="critical-tasks-expiring-window"
					type="number"
					min="1"
					max="365"
					disabled={saving}
					bind:value={expiringSoonWarningDays}
				/>
				<span class="text-sm text-muted-foreground">Days</span>
			</div>
		</div>
	</div>
	{#if !valid}
		<p class="text-sm text-destructive">Expiration must be 1–120 months; warning window must be 1–365 days.</p>
	{/if}
	{#if saveError}
		<p class="text-sm text-destructive" role="alert">{saveError}</p>
	{/if}
</section>
