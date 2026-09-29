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
		hasRetentionChanges,
		isRetentionValid,
		hasLossWarningChanges,
		isLossWarningValid,
		savingRetention,
		savingWarningWindow,
		onSaveRetention,
		onSaveLossWarning
	}: {
		retentionMonths?: number;
		warningWindowDays?: number;
		hasRetentionChanges: boolean;
		isRetentionValid: boolean;
		hasLossWarningChanges: boolean;
		isLossWarningValid: boolean;
		savingRetention: boolean;
		savingWarningWindow: boolean;
		onSaveRetention: () => void;
		onSaveLossWarning: () => void;
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
</div>
