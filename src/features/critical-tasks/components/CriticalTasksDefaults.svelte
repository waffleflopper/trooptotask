<script lang="ts">
	import { onDestroy, tick } from 'svelte';
	import { invalidate } from '$app/navigation';
	import * as Alert from '$lib/components/ui/alert';
	import * as AppDialog from '$lib/components/ui/app-dialog';
	import { Button } from '$lib/components/ui/button';
	import * as Field from '$lib/components/ui/field';
	import { Input } from '$lib/components/ui/input';
	import { Spinner } from '$lib/components/ui/spinner';
	import { buildRequestError, rejectedRequestMessage } from '$lib/stores/core';
	import { toastStore } from '$lib/stores/toast.svelte';
	import type { CriticalTasksSettings } from '../criticalTasks.types';

	let {
		orgId,
		settings,
		open = $bindable(false),
		onClose
	}: { orgId: string; settings: CriticalTasksSettings; open?: boolean; onClose?: () => void } = $props();
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

	function close() {
		open = false;
		onClose?.();
	}

	function cancel() {
		defaultExpirationMonths = savedExpirationMonths;
		expiringSoonWarningDays = savedWarningDays;
		saveError = '';
		close();
	}

	let mounted = true;
	onDestroy(() => (mounted = false));
	function isCurrent(requestOrgId: string): boolean {
		return mounted && orgId === requestOrgId;
	}

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
		} catch (error) {
			if (!isCurrent(requestOrgId)) return;
			saveError = rejectedRequestMessage(error, 'Failed to save Critical Tasks defaults');
			saving = false;
			await tick();
			saveButton?.focus();
			return;
		}
		if (isCurrent(requestOrgId)) {
			savedExpirationMonths = submitted.defaultExpirationMonths;
			savedWarningDays = submitted.expiringSoonWarningDays;
			saving = false;
			close();
			toastStore.success('Critical Tasks defaults saved');
		}
		// Even after leaving the dialog, so the workspace never keeps the old thresholds.
		// Last, because the workspace layout unmounts this page while the refresh loads.
		await invalidate('app:critical-tasks-data');
	}
</script>

<AppDialog.Root bind:open busy={saving} closeBlocked={changed} {onClose}>
	<AppDialog.Content showCloseButton={false}>
		<AppDialog.Header>
			<AppDialog.Title>Critical Tasks Defaults</AppDialog.Title>
			<AppDialog.Description>
				Shared Organization defaults for the task library. A task's own expiration override takes precedence.
			</AppDialog.Description>
		</AppDialog.Header>

		<AppDialog.Body>
			<form
				id="critical-tasks-defaults-form"
				class="grid gap-4"
				onsubmit={(event) => {
					event.preventDefault();
					void save();
				}}
			>
				<fieldset class="contents" disabled={saving}>
					{#if saveError}
						<Alert.Root variant="destructive">
							<Alert.Title>{saveError}</Alert.Title>
							<Alert.Description>Your entered defaults are kept. Try Save again.</Alert.Description>
						</Alert.Root>
					{/if}
					<Field.Root>
						<Field.Label for="critical-tasks-default-expiration">Default expiration</Field.Label>
						<div class="flex items-center gap-2">
							<Input
								id="critical-tasks-default-expiration"
								type="number"
								min="1"
								max="120"
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
								bind:value={expiringSoonWarningDays}
							/>
							<span class="text-sm text-muted-foreground">Days</span>
						</div>
						<Field.Description>When a current task becomes expiring soon.</Field.Description>
						{#if warningWindowError}<Field.Error>{warningWindowError}</Field.Error>{/if}
					</Field.Root>
				</fieldset>
			</form>
		</AppDialog.Body>

		<AppDialog.Footer>
			<Button type="button" variant="outline" disabled={saving} onclick={cancel}>Cancel</Button>
			<Button
				type="submit"
				form="critical-tasks-defaults-form"
				disabled={!!saveDisabledReason || saving}
				title={saveDisabledReason}
				bind:ref={saveButton}
			>
				{#if saving}<Spinner />{/if}
				{saving ? 'Saving...' : 'Save'}
			</Button>
		</AppDialog.Footer>
	</AppDialog.Content>
</AppDialog.Root>
