<script lang="ts">
	import { tick } from 'svelte';
	import { invalidate } from '$app/navigation';
	import * as Alert from '$lib/components/ui/alert';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import * as Field from '$lib/components/ui/field';
	import { Input } from '$lib/components/ui/input';
	import { Spinner } from '$lib/components/ui/spinner';
	import { buildRequestError, rejectedRequestMessage } from '$lib/stores/core';
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
	let saveButton = $state<HTMLButtonElement | null>(null);
	const changed = $derived(
		defaultExpirationMonths !== savedExpirationMonths || expiringSoonWarningDays !== savedWarningDays
	);
	const expirationError = $derived(
		inRange(defaultExpirationMonths, 120) ? undefined : 'Default expiration must be 1–120 months.'
	);
	const warningWindowError = $derived(
		inRange(expiringSoonWarningDays, 365) ? undefined : 'Expiring-soon window must be 1–365 days.'
	);
	const saveDisabledReason = $derived(
		expirationError || warningWindowError
			? 'Fix the highlighted defaults before saving.'
			: changed
				? undefined
				: 'No changes to save.'
	);

	function inRange(value: number, max: number): boolean {
		return Number.isInteger(value) && value >= 1 && value <= max;
	}

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
		if (saveDisabledReason || saving) return;
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
			if (!response.ok) throw await buildRequestError(response, 'POST', 'critical-tasks/settings');
			if (orgId !== requestOrgId) return;
			savedExpirationMonths = submitted.defaultExpirationMonths;
			savedWarningDays = submitted.expiringSoonWarningDays;
			await invalidate('app:critical-tasks-data');
		} catch (error) {
			if (orgId === requestOrgId) saveError = rejectedRequestMessage(error, 'Failed to save Critical Tasks defaults');
		} finally {
			if (orgId === requestOrgId) saving = false;
		}
		if (saveError) {
			await tick();
			saveButton?.focus();
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
			<Button
				size="sm"
				type="button"
				disabled={!!saveDisabledReason || saving}
				title={saveDisabledReason}
				onclick={save}
				bind:ref={saveButton}
			>
				{#if saving}<Spinner />{/if}
				{saving ? 'Saving...' : 'Save'}
			</Button>
		</div>
	</div>
	{#if saveError}
		<Alert.Root variant="destructive">
			<Alert.Title>{saveError}</Alert.Title>
			<Alert.Description>Your entered defaults are kept. Try Save again.</Alert.Description>
		</Alert.Root>
	{/if}
	<div class="grid gap-4 md:grid-cols-2">
		<Field.Root>
			<Field.Label for="critical-tasks-default-expiration">Default expiration</Field.Label>
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
			<Field.Description>Used when a task has no expiration override.</Field.Description>
			{#if expirationError}<Field.Error>{expirationError}</Field.Error>{/if}
		</Field.Root>
		<Field.Root>
			<Field.Label for="critical-tasks-expiring-window">Expiring-soon window</Field.Label>
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
			<Field.Description>When a current task becomes expiring soon.</Field.Description>
			{#if warningWindowError}<Field.Error>{warningWindowError}</Field.Error>{/if}
		</Field.Root>
	</div>
</section>
