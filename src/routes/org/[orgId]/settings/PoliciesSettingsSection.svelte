<script lang="ts">
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Separator } from '$lib/components/ui/separator/index.js';
	import { Spinner } from '$lib/components/ui/spinner/index.js';

	let {
		retentionMonths = $bindable(0),
		warningWindowDays = $bindable(0),
		criticalTasksDefaultExpirationMonths = $bindable(0),
		criticalTasksExpiringSoonWarningDays = $bindable(0),
		hasRetentionChanges,
		isRetentionValid,
		hasLossWarningChanges,
		isLossWarningValid,
		hasCriticalTasksChanges,
		isCriticalTasksValid,
		savingRetention,
		savingWarningWindow,
		savingCriticalTasks,
		onSaveRetention,
		onSaveLossWarning,
		onSaveCriticalTasks
	}: {
		retentionMonths?: number;
		warningWindowDays?: number;
		criticalTasksDefaultExpirationMonths?: number;
		criticalTasksExpiringSoonWarningDays?: number;
		hasRetentionChanges: boolean;
		isRetentionValid: boolean;
		hasLossWarningChanges: boolean;
		isLossWarningValid: boolean;
		hasCriticalTasksChanges: boolean;
		isCriticalTasksValid: boolean;
		savingRetention: boolean;
		savingWarningWindow: boolean;
		savingCriticalTasks: boolean;
		onSaveRetention: () => void;
		onSaveLossWarning: () => void;
		onSaveCriticalTasks: () => void;
	} = $props();
</script>

<div class="grid gap-4">
	<section
		class="grid gap-4 rounded-lg border bg-card p-4 text-card-foreground"
		aria-labelledby="archive-retention-heading"
	>
		<div class="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
			<div class="grid gap-1">
				<h2 id="archive-retention-heading" class="font-heading text-lg font-semibold tracking-tight">
					Archive Retention
				</h2>
				<p class="text-sm text-muted-foreground">Archived personnel are automatically purged after this window.</p>
			</div>
			<div class="flex flex-wrap items-center gap-2">
				<Badge variant={hasRetentionChanges ? 'outline' : 'secondary'}
					>{hasRetentionChanges ? 'Unsaved changes' : 'Saved'}</Badge
				>
				<Button
					size="sm"
					disabled={!hasRetentionChanges || !isRetentionValid || savingRetention}
					onclick={onSaveRetention}
				>
					{#if savingRetention}<Spinner />{/if}
					{savingRetention ? 'Saving...' : 'Save'}
				</Button>
			</div>
		</div>
		<Separator />
		<div class="grid gap-2 md:max-w-sm">
			<Label for="retention-months">Retention period</Label>
			<div class="flex items-center gap-2">
				<Input id="retention-months" type="number" min="1" max="120" bind:value={retentionMonths} />
				<span class="text-sm text-muted-foreground">Months</span>
			</div>
			{#if !isRetentionValid}<p class="text-sm text-destructive">Must be between 1 and 120 months.</p>{/if}
		</div>
	</section>

	<section class="grid gap-4 rounded-lg border bg-card p-4 text-card-foreground" aria-labelledby="loss-warning-heading">
		<div class="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
			<div class="grid gap-1">
				<h2 id="loss-warning-heading" class="font-heading text-lg font-semibold tracking-tight">Loss Warning Window</h2>
				<p class="text-sm text-muted-foreground">Flag personnel approaching ETS / PCS / DEROS this far out.</p>
			</div>
			<div class="flex flex-wrap items-center gap-2">
				<Badge variant={hasLossWarningChanges ? 'outline' : 'secondary'}
					>{hasLossWarningChanges ? 'Unsaved changes' : 'Saved'}</Badge
				>
				<Button
					size="sm"
					disabled={!hasLossWarningChanges || !isLossWarningValid || savingWarningWindow}
					onclick={onSaveLossWarning}
				>
					{#if savingWarningWindow}<Spinner />{/if}
					{savingWarningWindow ? 'Saving...' : 'Save'}
				</Button>
			</div>
		</div>
		<Separator />
		<div class="grid gap-2 md:max-w-sm">
			<Label for="loss-warning-window">Warning lead time</Label>
			<div class="flex items-center gap-2">
				<Input id="loss-warning-window" type="number" min="1" max="365" bind:value={warningWindowDays} />
				<span class="text-sm text-muted-foreground">Days</span>
			</div>
			{#if !isLossWarningValid}<p class="text-sm text-destructive">Must be between 1 and 365 days.</p>{/if}
		</div>
	</section>

	<section
		class="grid gap-4 rounded-lg border bg-card p-4 text-card-foreground"
		aria-labelledby="critical-tasks-defaults-heading"
	>
		<div class="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
			<div class="grid gap-1">
				<h2 id="critical-tasks-defaults-heading" class="font-heading text-lg font-semibold tracking-tight">
					Critical Tasks Defaults
				</h2>
				<p class="text-sm text-muted-foreground">Shared expiration thresholds for ICTL tracking.</p>
			</div>
			<div class="flex flex-wrap items-center gap-2">
				<Badge variant={hasCriticalTasksChanges ? 'outline' : 'secondary'}
					>{hasCriticalTasksChanges ? 'Unsaved changes' : 'Saved'}</Badge
				>
				<Button
					size="sm"
					disabled={!hasCriticalTasksChanges || !isCriticalTasksValid || savingCriticalTasks}
					onclick={onSaveCriticalTasks}
				>
					{#if savingCriticalTasks}<Spinner />{/if}
					{savingCriticalTasks ? 'Saving...' : 'Save'}
				</Button>
			</div>
		</div>
		<Separator />
		<div class="grid gap-4 md:grid-cols-2">
			<div class="grid gap-2">
				<Label for="critical-tasks-default-expiration">Default expiration</Label>
				<p class="text-sm text-muted-foreground">Used when an ICT task does not define its own override.</p>
				<div class="flex items-center gap-2">
					<Input
						id="critical-tasks-default-expiration"
						type="number"
						min="1"
						max="120"
						bind:value={criticalTasksDefaultExpirationMonths}
					/>
					<span class="text-sm text-muted-foreground">Months</span>
				</div>
			</div>
			<div class="grid gap-2">
				<Label for="critical-tasks-expiring-window">Expiring-soon window</Label>
				<p class="text-sm text-muted-foreground">Threshold that flips status from current to expiring.</p>
				<div class="flex items-center gap-2">
					<Input
						id="critical-tasks-expiring-window"
						type="number"
						min="1"
						max="365"
						bind:value={criticalTasksExpiringSoonWarningDays}
					/>
					<span class="text-sm text-muted-foreground">Days</span>
				</div>
			</div>
		</div>
		{#if !isCriticalTasksValid}
			<p class="text-sm text-destructive">
				Default expiration must be 1-120 months. Warning window must be 1-365 days.
			</p>
		{/if}
		<div class="grid gap-2 md:max-w-sm">
			<Label for="critical-tasks-auto-notify">Auto-notify squad leader</Label>
			<p class="text-sm text-muted-foreground">Send a daily digest of expiring tasks to assigned NCO.</p>
			<div class="flex items-center gap-2">
				<select
					id="critical-tasks-auto-notify"
					class="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
					disabled
					aria-describedby="critical-tasks-auto-notify-note"
				>
					<option>Coming soon</option>
				</select>
				<span id="critical-tasks-auto-notify-note" class="text-sm text-muted-foreground">Not configured</span>
			</div>
		</div>
	</section>
</div>
