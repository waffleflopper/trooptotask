<script lang="ts">
	import EmptyState from '$lib/components/ui/EmptyState.svelte';
	import MultiTagSelect from '$lib/components/ui/MultiTagSelect.svelte';
	import type { TagOption } from '$lib/components/ui/MultiTagSelect.svelte';
	import type { DutyTemplateSlotBlockingMode } from '../duty-roster.types';
	import type {
		EditableBaseline,
		EditableSlot,
		PersonnelOption,
		SetupMode
	} from './advancedDutyTemplateBuilder.helpers';

	interface Props {
		setupMode: SetupMode;
		draftSlots: EditableSlot[];
		collapsedSlots: Set<string>;
		draftRotationBaselines: EditableBaseline[];
		rotationPoolOptions: string[];
		rankTagOptions: TagOption[];
		groupTagOptions: TagOption[];
		mosTagOptions: TagOption[];
		roleTagOptions: TagOption[];
		personnel: PersonnelOption[];
		formatPersonLabel: (person: PersonnelOption) => string;
		slotSummaryLine: (slot: EditableSlot) => string;
		onAddSlot: () => void;
		onRemoveSlot: (key: string) => void;
		onToggleSlotCollapsed: (key: string) => void;
		onUpdateSlot: (key: string, patch: Partial<EditableSlot>) => void;
		onAddBaseline: () => void;
		onRemoveBaseline: (key: string) => void;
		onUpdateBaseline: (key: string, patch: Partial<EditableBaseline>) => void;
		onBack: () => void;
		onReview: () => void;
	}
	let props: Props = $props();
</script>

<section class="builder-card">
	<div class="section-header">
		<div>
			<p class="eyebrow">Slot Builder</p>
			<h3>Define the roles this duty needs.</h3>
		</div>
		<button class="btn btn-sm" type="button" onclick={props.onAddSlot}>Add Slot</button>
	</div>

	{#if props.draftSlots.length === 0}
		<EmptyState
			message="No slot definitions yet. Add the first slot so the template can describe who this duty needs."
			variant="simple"
		/>
	{:else}
		<div class="slot-list">
			{#each props.draftSlots as slot, index (slot.key)}
				{@const isCollapsed = props.collapsedSlots.has(slot.key)}
				<article class="slot-card" class:slot-collapsed={isCollapsed}>
					<div class="slot-header">
						<button
							class="slot-collapse-btn"
							type="button"
							aria-label={isCollapsed ? 'Expand slot' : 'Collapse slot'}
							aria-expanded={!isCollapsed}
							onclick={() => props.onToggleSlotCollapsed(slot.key)}>▾</button
						>
						<div class="slot-title">
							<h4>{slot.roleLabel || `Slot ${index + 1}`}</h4>
							{#if isCollapsed}<p class="slot-summary-line">{props.slotSummaryLine(slot)}</p>{/if}
						</div>
						<button class="btn btn-sm" type="button" onclick={() => props.onRemoveSlot(slot.key)}>Remove</button>
					</div>
					{#if !isCollapsed}
						<div class="form-grid">
							<label class="field"
								><span>Role label</span><input
									class="input"
									type="text"
									value={slot.roleLabel}
									oninput={(e) =>
										props.onUpdateSlot(slot.key, { roleLabel: (e.currentTarget as HTMLInputElement).value })}
								/></label
							>
							<label class="field"
								><span>Quantity</span><input
									class="input"
									type="number"
									min="1"
									value={slot.quantity}
									oninput={(e) =>
										props.onUpdateSlot(slot.key, {
											quantity: Number((e.currentTarget as HTMLInputElement).value) || 1
										})}
								/></label
							>
							<label class="field"
								><span>Allowed ranks</span><MultiTagSelect
									options={props.rankTagOptions}
									value={slot.allowedRanks}
									placeholder="Any rank..."
									ariaLabel="Allowed ranks"
									onChange={(ids) => props.onUpdateSlot(slot.key, { allowedRanks: ids })}
								/></label
							>
							<label class="field"
								><span>Allowed groups</span><MultiTagSelect
									options={props.groupTagOptions}
									value={slot.allowedGroupIds}
									placeholder="Any group..."
									ariaLabel="Allowed groups"
									onChange={(ids) => props.onUpdateSlot(slot.key, { allowedGroupIds: ids })}
								/></label
							>
							{#if props.setupMode === 'full'}
								<label class="field"
									><span>Preferred groups</span><MultiTagSelect
										options={props.groupTagOptions}
										value={slot.preferredGroupIds}
										placeholder="Any group..."
										ariaLabel="Preferred groups"
										onChange={(ids) => props.onUpdateSlot(slot.key, { preferredGroupIds: ids })}
									/></label
								>
								<label class="field"
									><span>MOS filter</span><MultiTagSelect
										options={props.mosTagOptions}
										value={slot.allowedMosValues}
										placeholder="Any MOS..."
										ariaLabel="MOS filter"
										onChange={(ids) => props.onUpdateSlot(slot.key, { allowedMosValues: ids })}
									/></label
								>
								<label class="field"
									><span>Personnel role filter</span><MultiTagSelect
										options={props.roleTagOptions}
										value={slot.allowedRoleValues}
										placeholder="Any role..."
										ariaLabel="Personnel role filter"
										onChange={(ids) => props.onUpdateSlot(slot.key, { allowedRoleValues: ids })}
									/></label
								>
							{/if}
							<label class="field"
								><span>Rotation group</span><input
									class="input"
									type="text"
									value={slot.rotationPoolKey}
									placeholder="Leave blank to keep this slot on its own rotation"
									oninput={(e) =>
										props.onUpdateSlot(slot.key, { rotationPoolKey: (e.currentTarget as HTMLInputElement).value })}
								/><span class="field-hint"
									>Use the same rotation group on multiple slots when those positions should rotate together.</span
								></label
							>
							<label class="field"
								><span>Conflict behavior for this slot</span><select
									class="select"
									aria-label="Conflict behavior for this slot"
									value={slot.blockingMode}
									onchange={(e) =>
										props.onUpdateSlot(slot.key, {
											blockingMode: (e.currentTarget as HTMLSelectElement).value as DutyTemplateSlotBlockingMode
										})}
									><option value="inherit">Inherit template policy</option><option value="blocking"
										>Force blocking</option
									><option value="non-blocking">Force non-blocking</option></select
								><span class="field-hint">Override the template-wide blocking rule for this slot only when needed.</span
								></label
							>
						</div>
					{/if}
				</article>
			{/each}
		</div>
	{/if}
</section>

{#if props.setupMode === 'full'}
	<section class="builder-card">
		<div class="section-header">
			<div>
				<p class="eyebrow">Rotation Starting Points</p>
				<h3>Set a starting point when you do not have enough duty history yet.</h3>
			</div>
			<button class="btn btn-sm" type="button" onclick={props.onAddBaseline}>Add Baseline</button>
		</div>
		{#if props.draftRotationBaselines.length === 0}
			<EmptyState
				message="No manual starting points yet. Add one when a rotation group needs a last-served date to start from."
				variant="simple"
			/>
		{:else}
			<div class="slot-list">
				{#each props.draftRotationBaselines as baseline, index (baseline.key)}
					<article class="slot-card">
						<div class="slot-header">
							<h4>Baseline {index + 1}</h4>
							<button class="btn btn-sm" type="button" onclick={() => props.onRemoveBaseline(baseline.key)}
								>Remove</button
							>
						</div>
						<div class="form-grid">
							<label class="field"
								><span>Rotation group</span><input
									class="input"
									type="text"
									list={`rotation-pool-${baseline.key}`}
									value={baseline.rotationPoolKey}
									oninput={(e) =>
										props.onUpdateBaseline(baseline.key, {
											rotationPoolKey: (e.currentTarget as HTMLInputElement).value
										})}
								/><span class="field-hint">Match this to the rotation group used on the slot you want to seed.</span
								><datalist id={`rotation-pool-${baseline.key}`}
									>{#each props.rotationPoolOptions as option (option)}<option value={option}></option>{/each}</datalist
								></label
							>
							<label class="field"
								><span>Person</span><select
									class="select"
									value={baseline.personId}
									onchange={(e) =>
										props.onUpdateBaseline(baseline.key, { personId: (e.currentTarget as HTMLSelectElement).value })}
									><option value="">Select person</option>{#each props.personnel as person (person.id)}<option
											value={person.id}>{props.formatPersonLabel(person)}</option
										>{/each}</select
								></label
							>
							<label class="field"
								><span>Last served date</span><input
									class="input"
									type="date"
									value={baseline.lastServedDate}
									oninput={(e) =>
										props.onUpdateBaseline(baseline.key, {
											lastServedDate: (e.currentTarget as HTMLInputElement).value
										})}
								/></label
							>
						</div>
					</article>
				{/each}
			</div>
		{/if}
	</section>
{/if}

<div class="step-actions">
	<button class="btn btn-secondary" type="button" onclick={props.onBack}>Back</button>
	<button class="btn btn-primary" type="button" onclick={props.onReview}>Review Template</button>
</div>

<style>
	.builder-card {
		padding: var(--sp-5);
		border: 1px solid var(--border-default);
		border-radius: var(--radius-lg);
		background: var(--surface-panel);
		margin-top: var(--sp-4);
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
	.slot-title h4,
	h3 {
		margin: 0;
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
	.eyebrow {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-semibold);
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--text-secondary);
	}
	.field-hint {
		margin: 0;
		color: var(--text-tertiary);
		font-size: var(--text-sm);
	}
	.step-actions {
		display: flex;
		gap: var(--sp-3);
		flex-wrap: wrap;
		margin-top: var(--sp-4);
	}
	.slot-summary-line {
		margin: 0;
		color: var(--text-secondary);
	}
</style>
