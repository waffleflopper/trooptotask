<script lang="ts">
	import MultiTagSelect from './MultiTagSelect.svelte';
	import type { TagOption } from './MultiTagSelect.svelte';
	import type { StatusType } from '$lib/types';
	import type { SetupMode, SoftPreferenceOption } from './advancedDutyTemplateBuilder.helpers';

	interface Props {
		setupMode: SetupMode;
		scopeType: 'organization' | 'groups';
		scopeGroupIds: string[];
		exemptPersonnelIds: string[];
		exemptStatusTypeIds: string[];
		coverageMode: 'all-day' | 'timed';
		startTime: string;
		endTime: string;
		spansMidnight: boolean;
		isBlocking: boolean;
		cooldownHours: number;
		groupTagOptions: TagOption[];
		personnelTagOptions: TagOption[];
		statusTypes: StatusType[];
		draftSoftPreferences: Array<{ type: string; enabled: boolean }>;
		softPreferenceOptions: SoftPreferenceOption[];
		onScopeTypeChange: (value: 'organization' | 'groups') => void;
		onScopeGroupIdsChange: (value: string[]) => void;
		onExemptPersonnelIdsChange: (value: string[]) => void;
		onToggleExemptStatusType: (value: string) => void;
		onCoverageModeChange: (value: 'all-day' | 'timed') => void;
		onStartTimeChange: (value: string) => void;
		onEndTimeChange: (value: string) => void;
		onSpansMidnightChange: (value: boolean) => void;
		onIsBlockingChange: (value: boolean) => void;
		onCooldownHoursChange: (value: number) => void;
		onMoveSoftPreference: (type: string, direction: -1 | 1) => void;
		onUpdateSoftPreference: (type: string, enabled: boolean) => void;
		onBack: () => void;
		onNext: () => void;
	}

	let props: Props = $props();
</script>

<section class="builder-card">
	<div class="form-grid">
		<label class="field">
			<span>Scope</span>
			<select
				class="select"
				value={props.scopeType}
				onchange={(e) =>
					props.onScopeTypeChange((e.currentTarget as HTMLSelectElement).value as 'organization' | 'groups')}
			>
				<option value="organization">Whole organization</option>
				<option value="groups">Selected groups</option>
			</select>
		</label>

		<label class="field">
			<span>Coverage mode</span>
			<select
				class="select"
				value={props.coverageMode}
				onchange={(e) =>
					props.onCoverageModeChange((e.currentTarget as HTMLSelectElement).value as 'all-day' | 'timed')}
			>
				<option value="all-day">All day</option>
				<option value="timed">Timed shift</option>
			</select>
		</label>

		{#if props.coverageMode === 'timed'}
			<label class="field">
				<span>Start time</span>
				<input
					class="input"
					type="time"
					value={props.startTime}
					oninput={(e) => props.onStartTimeChange((e.currentTarget as HTMLInputElement).value)}
				/>
			</label>
			<label class="field">
				<span>End time</span>
				<input
					class="input"
					type="time"
					value={props.endTime}
					oninput={(e) => props.onEndTimeChange((e.currentTarget as HTMLInputElement).value)}
				/>
			</label>
			<label class="field field-checkbox">
				<input
					type="checkbox"
					checked={props.spansMidnight}
					onchange={(e) => props.onSpansMidnightChange((e.currentTarget as HTMLInputElement).checked)}
				/>
				<span>Spans midnight (e.g. 0800–0800 is 24 hours)</span>
			</label>
		{/if}

		<label class="field field-checkbox">
			<input
				type="checkbox"
				checked={props.isBlocking}
				onchange={(e) => props.onIsBlockingChange((e.currentTarget as HTMLInputElement).checked)}
			/>
			<span>Blocking duty</span>
		</label>

		<label class="field">
			<span>Cooldown hours</span>
			<input
				class="input"
				type="number"
				min="0"
				value={props.cooldownHours}
				oninput={(e) => props.onCooldownHoursChange(Number((e.currentTarget as HTMLInputElement).value) || 0)}
			/>
		</label>
	</div>

	{#if props.scopeType === 'groups'}
		<div class="selection-block">
			<p class="selection-label">Template scope groups</p>
			<MultiTagSelect
				options={props.groupTagOptions}
				value={props.scopeGroupIds}
				placeholder="Select groups..."
				ariaLabel="Template scope groups"
				onChange={props.onScopeGroupIdsChange}
			/>
		</div>
	{/if}

	<div class="selection-block">
		<p class="selection-label">Permanently exempt personnel</p>
		<p class="selection-hint">
			These people are never selected by the generator, regardless of rotation order or slot eligibility rules.
		</p>
		<MultiTagSelect
			options={props.personnelTagOptions}
			value={props.exemptPersonnelIds}
			placeholder="Search and select exempt personnel..."
			ariaLabel="Exempt personnel"
			onChange={props.onExemptPersonnelIdsChange}
		/>
	</div>

	{#if props.statusTypes.length > 0}
		<div class="selection-block">
			<p class="selection-label">Status-based exemptions</p>
			<p class="selection-hint">
				If someone has one of these calendar statuses on a duty day, they are treated as exempt for that day only and
				re-enter rotation automatically when the status no longer applies.
			</p>
			<div class="chip-list">
				{#each props.statusTypes as statusType (statusType.id)}
					<button
						class="chip status-chip"
						class:selected={props.exemptStatusTypeIds.includes(statusType.id)}
						aria-pressed={props.exemptStatusTypeIds.includes(statusType.id)}
						style={`--chip-color: ${statusType.color}; --chip-text: ${statusType.textColor}`}
						onclick={() => props.onToggleExemptStatusType(statusType.id)}
					>
						{statusType.name}
					</button>
				{/each}
			</div>
		</div>
	{/if}

	{#if props.setupMode === 'full'}
		<section class="builder-card nested-card">
			<div class="section-header">
				<div>
					<p class="eyebrow">Soft Preference Order</p>
					<h3>Choose how the generator breaks ties.</h3>
					<p class="builder-copy">
						Move the enabled preferences into the order you want the generator to consider them.
					</p>
				</div>
			</div>
			<div class="slot-list">
				{#each props.draftSoftPreferences as preference, index (preference.type)}
					<article class="slot-card">
						<div class="slot-header">
							<div>
								<h4>
									{props.softPreferenceOptions.find((option) => option.type === preference.type)?.label ??
										preference.type}
								</h4>
								<p class="field-hint">
									{props.softPreferenceOptions.find((option) => option.type === preference.type)?.description}
								</p>
							</div>
							<div class="slot-actions">
								<button
									class="btn btn-sm"
									type="button"
									disabled={index === 0}
									onclick={() => props.onMoveSoftPreference(preference.type, -1)}>Move Up</button
								>
								<button
									class="btn btn-sm"
									type="button"
									disabled={index === props.draftSoftPreferences.length - 1}
									onclick={() => props.onMoveSoftPreference(preference.type, 1)}>Move Down</button
								>
							</div>
						</div>
						<label class="field field-checkbox">
							<input
								type="checkbox"
								checked={preference.enabled}
								onchange={(e) =>
									props.onUpdateSoftPreference(preference.type, (e.currentTarget as HTMLInputElement).checked)}
							/>
							<span>Enabled</span>
						</label>
					</article>
				{/each}
			</div>
		</section>
	{/if}
</section>

<div class="step-actions">
	<button class="btn btn-secondary" type="button" onclick={props.onBack}>Back</button>
	<button class="btn btn-primary" type="button" onclick={props.onNext}>Next</button>
</div>

<style>
	.builder-card {
		padding: var(--sp-5);
		border: 1px solid var(--border-default);
		border-radius: var(--radius-lg);
		background: var(--surface-panel);
	}
	.nested-card {
		margin-top: var(--sp-4);
	}
	.form-grid {
		display: grid;
		gap: var(--sp-3);
		grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
	}
	.field {
		display: grid;
		gap: var(--sp-2);
	}
	.field > span,
	.selection-label,
	.eyebrow {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-semibold);
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--text-secondary);
	}
	.field-checkbox {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
	}
	.selection-block {
		margin-top: var(--sp-4);
	}
	.selection-hint,
	.field-hint,
	.builder-copy {
		margin: var(--sp-2) 0 0;
		color: var(--text-tertiary);
		font-size: var(--text-sm);
	}
	.chip-list {
		display: flex;
		flex-wrap: wrap;
		gap: var(--sp-2);
		margin-top: var(--sp-3);
	}
	.chip {
		appearance: none;
		padding: 4px 8px;
		border-radius: var(--radius-sm);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-medium);
		letter-spacing: 0.08em;
		text-transform: uppercase;
		border: 1px solid var(--border-default);
		background: var(--surface-subtle);
		color: var(--text-secondary);
		cursor: pointer;
		transition:
			background-color var(--transition-fast),
			border-color var(--transition-fast),
			color var(--transition-fast);
	}
	.chip:hover {
		border-color: var(--ink-35);
		background: var(--surface-panel);
		color: var(--text-primary);
	}
	.chip.selected {
		background: var(--amber-light);
		border-color: var(--amber);
		color: var(--amber-dark);
	}
	.status-chip.selected {
		background: var(--chip-color);
		border-color: var(--chip-color);
		color: var(--chip-text);
	}
	.section-header,
	.slot-header {
		display: flex;
		justify-content: space-between;
		gap: var(--sp-4);
	}
	.slot-list {
		display: grid;
		gap: var(--sp-3);
		margin-top: var(--sp-4);
	}
	.slot-card {
		padding: var(--sp-4);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-md);
		background: var(--surface-subtle);
	}
	.slot-actions,
	.step-actions {
		display: flex;
		gap: var(--sp-3);
		flex-wrap: wrap;
	}
	.step-actions {
		margin-top: var(--sp-4);
	}
	h3,
	h4 {
		margin: 0;
	}
</style>
