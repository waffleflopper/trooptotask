<script lang="ts">
	import Spinner from '$lib/components/ui/Spinner.svelte';

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

<div class="policies-tab">
	<section class="ledger-section" aria-labelledby="archive-retention-heading">
		<div class="ledger-heading">
			<span>01</span>
			<h3 id="archive-retention-heading">Archive Retention</h3>
			<div class="ledger-status-actions">
				<p
					class="state-label"
					class:state-label--success={!hasRetentionChanges}
					class:state-label--warning={hasRetentionChanges}
				>
					{hasRetentionChanges ? 'Unsaved changes' : 'Saved'}
				</p>
				<button
					class="btn btn-primary btn-sm"
					disabled={!hasRetentionChanges || !isRetentionValid || savingRetention}
					onclick={onSaveRetention}
				>
					{#if savingRetention}<Spinner />{/if}
					{savingRetention ? 'Saving...' : 'Save'}
				</button>
			</div>
		</div>
		<div class="ledger-row">
			<div>
				<label class="field-label" for="retention-months">Retention period</label>
				<p class="field-hint">Archived personnel are automatically purged after this window.</p>
			</div>
			<div class="policy-control">
				<input
					id="retention-months"
					class="input input--number"
					type="number"
					min="1"
					max="120"
					bind:value={retentionMonths}
				/>
				<span>Months</span>
				{#if !isRetentionValid}<p class="validation-hint">Must be between 1 and 120 months.</p>{/if}
			</div>
		</div>
	</section>

	<section class="ledger-section" aria-labelledby="loss-warning-heading">
		<div class="ledger-heading">
			<span>02</span>
			<h3 id="loss-warning-heading">Loss Warning Window</h3>
			<div class="ledger-status-actions">
				<p
					class="state-label"
					class:state-label--success={!hasLossWarningChanges}
					class:state-label--warning={hasLossWarningChanges}
				>
					{hasLossWarningChanges ? 'Unsaved changes' : 'Saved'}
				</p>
				<button
					class="btn btn-primary btn-sm"
					disabled={!hasLossWarningChanges || !isLossWarningValid || savingWarningWindow}
					onclick={onSaveLossWarning}
				>
					{#if savingWarningWindow}<Spinner />{/if}
					{savingWarningWindow ? 'Saving...' : 'Save'}
				</button>
			</div>
		</div>
		<div class="ledger-row">
			<div>
				<label class="field-label" for="loss-warning-window">Warning lead time</label>
				<p class="field-hint">Flag personnel approaching ETS / PCS / DEROS this far out.</p>
			</div>
			<div class="policy-control">
				<input
					id="loss-warning-window"
					class="input input--number"
					type="number"
					min="1"
					max="365"
					bind:value={warningWindowDays}
				/>
				<span>Days</span>
				{#if !isLossWarningValid}<p class="validation-hint">Must be between 1 and 365 days.</p>{/if}
			</div>
		</div>
	</section>

	<section class="ledger-section" aria-labelledby="critical-tasks-defaults-heading">
		<div class="ledger-heading">
			<span>03</span>
			<h3 id="critical-tasks-defaults-heading">Critical Tasks Defaults</h3>
			<div class="ledger-status-actions">
				<p
					class="state-label"
					class:state-label--success={!hasCriticalTasksChanges}
					class:state-label--warning={hasCriticalTasksChanges}
				>
					{hasCriticalTasksChanges ? 'Unsaved changes' : 'Saved'}
				</p>
				<button
					class="btn btn-primary btn-sm"
					disabled={!hasCriticalTasksChanges || !isCriticalTasksValid || savingCriticalTasks}
					onclick={onSaveCriticalTasks}
				>
					{#if savingCriticalTasks}<Spinner />{/if}
					{savingCriticalTasks ? 'Saving...' : 'Save'}
				</button>
			</div>
		</div>
		<div class="ledger-row">
			<div>
				<label class="field-label" for="critical-tasks-default-expiration">Default expiration</label>
				<p class="field-hint">Used when an ICT task does not define its own override.</p>
			</div>
			<div class="policy-control">
				<input
					id="critical-tasks-default-expiration"
					class="input input--number"
					type="number"
					min="1"
					max="120"
					bind:value={criticalTasksDefaultExpirationMonths}
				/>
				<span>Months</span>
			</div>
		</div>
		<div class="ledger-row">
			<div>
				<label class="field-label" for="critical-tasks-expiring-window">Expiring-soon window</label>
				<p class="field-hint">Threshold that flips status from current to expiring.</p>
			</div>
			<div class="policy-control">
				<input
					id="critical-tasks-expiring-window"
					class="input input--number"
					type="number"
					min="1"
					max="365"
					bind:value={criticalTasksExpiringSoonWarningDays}
				/>
				<span>Days</span>
				{#if !isCriticalTasksValid}
					<p class="validation-hint">Default expiration must be 1-120 months. Warning window must be 1-365 days.</p>
				{/if}
			</div>
		</div>
		<div class="ledger-row">
			<div>
				<label class="field-label" for="critical-tasks-auto-notify">Auto-notify squad leader</label>
				<p class="field-hint">Send a daily digest of expiring tasks to assigned NCO.</p>
			</div>
			<div class="policy-control">
				<select
					id="critical-tasks-auto-notify"
					class="input policy-select"
					disabled
					aria-describedby="critical-tasks-auto-notify-note"
				>
					<option>Coming soon</option>
				</select>
				<span id="critical-tasks-auto-notify-note">Not configured</span>
			</div>
		</div>
	</section>
</div>
