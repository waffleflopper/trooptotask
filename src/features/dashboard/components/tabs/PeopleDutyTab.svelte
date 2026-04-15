<script lang="ts">
	import { browser } from '$app/environment';
	import type { DashboardContext } from '../../contexts/DashboardContext.svelte';
	import UpcomingLossesWidget from '../UpcomingLossesWidget.svelte';

	interface Props {
		ctx: DashboardContext;
	}

	let { ctx }: Props = $props();

	const dutyDays = $derived(ctx.dutyForDays(2));
	const today = $derived(dutyDays[0]);
	const tomorrow = $derived(dutyDays[1]);

	type OutTodayPerson = (typeof ctx.nonAvailablePersonnel)[number];
	type UpcomingChange = (typeof ctx.upcomingChanges)[number];
	type GroupedEntries<T> = Array<[string, T[]]>;

	function sortGroupName(a: string, b: string): number {
		if (a === 'Unassigned') return 1;
		if (b === 'Unassigned') return -1;
		return a.localeCompare(b);
	}

	function groupEntries<T>(
		items: T[],
		getKey: (item: T) => string,
		sort: (a: string, b: string) => number
	): GroupedEntries<T> {
		const grouped: Record<string, T[]> = {};
		for (const item of items) {
			const key = getKey(item);
			(grouped[key] ??= []).push(item);
		}
		return Object.entries(grouped).sort(([a], [b]) => sort(a, b));
	}

	// ── Out Today grouping toggle ───────────────────────────
	const OUT_TODAY_KEY = 'dashboard-out-today-group-by';
	type OutTodayGroupBy = 'status' | 'group';

	let outTodayGroupBy = $state<OutTodayGroupBy>('status');

	function readStorageValue(key: string): string | null {
		if (!browser || typeof globalThis.localStorage?.getItem !== 'function') return null;

		try {
			return globalThis.localStorage.getItem(key);
		} catch {
			return null;
		}
	}

	function writeStorageValue(key: string, value: string) {
		if (!browser || typeof globalThis.localStorage?.setItem !== 'function') return;

		try {
			globalThis.localStorage.setItem(key, value);
		} catch {
			// Preference persistence is best-effort; the UI state has already updated.
		}
	}

	$effect(() => {
		const saved = readStorageValue(OUT_TODAY_KEY);
		if (saved === 'status' || saved === 'group') outTodayGroupBy = saved;
	});

	function setOutTodayGroupBy(value: OutTodayGroupBy) {
		outTodayGroupBy = value;
		writeStorageValue(OUT_TODAY_KEY, value);
	}

	const outTodayByStatus = $derived.by(() => {
		return groupEntries<OutTodayPerson>(
			ctx.nonAvailablePersonnel,
			(person) => person.statusName,
			(a, b) => a.localeCompare(b)
		);
	});

	const outTodayByGroup = $derived.by(() => {
		return groupEntries<OutTodayPerson>(ctx.nonAvailablePersonnel, (person) => person.groupName, sortGroupName);
	});

	// ── Upcoming Changes grouping toggle ───────────────────
	const UPCOMING_KEY = 'dashboard-upcoming-group-by';
	type UpcomingGroupBy = 'date' | 'group';

	let upcomingGroupBy = $state<UpcomingGroupBy>('date');

	$effect(() => {
		const saved = readStorageValue(UPCOMING_KEY);
		if (saved === 'date' || saved === 'group') upcomingGroupBy = saved;
	});

	function setUpcomingGroupBy(value: UpcomingGroupBy) {
		upcomingGroupBy = value;
		writeStorageValue(UPCOMING_KEY, value);
	}

	const upcomingByGroup = $derived.by(() => {
		return groupEntries<UpcomingChange>(ctx.upcomingChanges, (change) => change.groupName, sortGroupName);
	});
</script>

<section class="tab-panel">
	<!-- Primary two-column split: Out Today / Duty Roster -->
	<div class="primary-split">
		<!-- Out Today -->
		<div class="split-col">
			<div class="section-header">
				<span class="section-kicker">Out Today</span>
				{#if ctx.nonAvailablePersonnel.length > 0}
					<span class="section-count">{ctx.nonAvailablePersonnel.length}</span>
				{/if}
				{#if ctx.nonAvailablePersonnel.length > 0}
					<div class="view-toggle">
						<button
							class="toggle-btn"
							class:active={outTodayGroupBy === 'status'}
							onclick={() => setOutTodayGroupBy('status')}>Status</button
						>
						<button
							class="toggle-btn"
							class:active={outTodayGroupBy === 'group'}
							onclick={() => setOutTodayGroupBy('group')}>Group</button
						>
					</div>
				{/if}
			</div>

			{#if ctx.nonAvailablePersonnel.length === 0}
				<p class="empty-mono">All personnel accounted for.</p>
			{:else if outTodayGroupBy === 'status'}
				<div class="out-list">
					{#each outTodayByStatus as [statusName, people], i (statusName)}
						<div class="group-header" class:group-header--first={i === 0} style="color: {people[0].statusColor}">
							{statusName}
						</div>
						{#each people as person (person.id)}
							<div class="out-row">
								<div class="person-identity">
									<span class="person-rank">{person.rank}</span>
									<span class="person-name">{person.personName.replace(/^[A-Z0-9]+ /, '')}</span>
								</div>
							</div>
						{/each}
					{/each}
				</div>
			{:else}
				<div class="out-list">
					{#each outTodayByGroup as [groupName, people], i (groupName)}
						<div class="group-header" class:group-header--first={i === 0}>{groupName}</div>
						{#each people as person (person.id)}
							<div class="out-row">
								<div class="person-identity">
									<span class="person-rank">{person.rank}</span>
									<span class="person-name">{person.personName.replace(/^[A-Z0-9]+ /, '')}</span>
								</div>
								<span
									class="status-label"
									style="background: color-mix(in srgb, {person.statusColor} 15%, transparent); color: {person.statusColor}"
									>{person.statusName}</span
								>
							</div>
						{/each}
					{/each}
				</div>
			{/if}
		</div>

		<!-- Duty Roster -->
		<div class="split-col">
			<div class="section-kicker">Duty Roster</div>

			{#if today}
				<div class="duty-day">
					<div class="duty-day-label">Today</div>
					{#if today.assignments.length === 0}
						<p class="empty-mono">No assignments today.</p>
					{:else}
						{#each today.assignments as a (a.id)}
							<div class="duty-row">
								<span class="duty-type">{a.typeName}</span>
								<span class="duty-assignee">{a.assigneeName}</span>
							</div>
						{/each}
					{/if}
				</div>
			{/if}

			{#if tomorrow}
				<div class="duty-day duty-day--tomorrow">
					<div class="duty-day-label">Tomorrow</div>
					{#if tomorrow.assignments.length === 0}
						<p class="empty-mono">No assignments tomorrow.</p>
					{:else}
						{#each tomorrow.assignments as a (a.id)}
							<div class="duty-row">
								<span class="duty-type">{a.typeName}</span>
								<span class="duty-assignee">{a.assigneeName}</span>
							</div>
						{/each}
					{/if}
				</div>
			{/if}

			<!-- Advanced duty events -->
			{#if ctx.todayAdvancedDuty.length > 0}
				{#each ctx.todayAdvancedDuty as event (event.id)}
					<div class="duty-day">
						<div class="duty-day-label">{event.templateName}</div>
						{#each event.slots as slot (slot.key)}
							<div class="duty-row">
								<span class="duty-type">{slot.roleLabel}</span>
								<span class="duty-assignee">{slot.assigneeName}</span>
							</div>
						{/each}
					</div>
				{/each}
			{/if}
		</div>
	</div>

	<!-- Upcoming Losses — primary operational widget for medium-range departure planning.
	     Positioned between the daily operational view and the secondary housekeeping row
	     to reflect its status as a first-class concern, not a calendar footnote. -->
	<div class="losses-section">
		<UpcomingLossesWidget losses={ctx.upcomingLosses} formatDate={(d) => ctx.formatShortDate(d)} />
	</div>

	<!-- Secondary row: Onboarding + Upcoming Changes -->
	<div class="secondary-split">
		<!-- Onboarding Pipeline -->
		<div class="split-col">
			<div class="section-header">
				<span class="section-kicker">Onboarding</span>
				{#if ctx.activeOnboardings.length > 0}
					<span class="section-count">{ctx.activeOnboardings.length}</span>
				{/if}
			</div>

			{#if ctx.activeOnboardings.length === 0}
				<p class="empty-mono">No active onboardings.</p>
			{:else}
				{#each ctx.activeOnboardings as o (o.id)}
					<div class="onboarding-row">
						<span class="onboarding-name">{o.personName}</span>
						<div class="onboarding-bar-track">
							<div
								class="onboarding-bar-fill"
								style="width: {o.pct}%; background: {o.pct >= 50 ? 'var(--success)' : 'var(--amber)'}"
							></div>
						</div>
						<span class="onboarding-pct">{o.pct}%</span>
					</div>
				{/each}
			{/if}
		</div>

		<!-- Upcoming Changes -->
		<div class="split-col">
			<div class="section-header">
				<span class="section-kicker">Upcoming Changes</span>
				{#if ctx.upcomingChanges.length > 0}
					<span class="section-count">{ctx.upcomingChanges.length}</span>
				{/if}
				{#if ctx.upcomingChanges.length > 0}
					<div class="view-toggle">
						<button
							class="toggle-btn"
							class:active={upcomingGroupBy === 'date'}
							onclick={() => setUpcomingGroupBy('date')}>Date</button
						>
						<button
							class="toggle-btn"
							class:active={upcomingGroupBy === 'group'}
							onclick={() => setUpcomingGroupBy('group')}>Group</button
						>
					</div>
				{/if}
			</div>

			{#if ctx.upcomingChanges.length === 0}
				<p class="empty-mono">No changes in the next 7 days.</p>
			{:else if upcomingGroupBy === 'date'}
				{#each ctx.upcomingChanges as change (change.key)}
					<div class="upcoming-row">
						<span class="upcoming-name">{change.personName}</span>
						<span class="upcoming-meta">{ctx.formatShortDate(change.date)}</span>
						<span class="upcoming-reason">{change.direction === 'departing' ? change.statusName : 'Returning'}</span>
					</div>
				{/each}
			{:else}
				{#each upcomingByGroup as [groupName, changes], i (groupName)}
					<div class="group-header" class:group-header--first={i === 0}>{groupName}</div>
					{#each changes as change (change.key)}
						<div class="upcoming-row">
							<span class="upcoming-name">{change.personName}</span>
							<span class="upcoming-meta">{ctx.formatShortDate(change.date)}</span>
							<span class="upcoming-reason">{change.direction === 'departing' ? change.statusName : 'Returning'}</span>
						</div>
					{/each}
				{/each}
			{/if}
		</div>
	</div>
</section>

<style>
	.tab-panel {
		padding: 0 var(--sp-4) var(--sp-12);
	}

	.section-kicker {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-semibold);
		text-transform: uppercase;
		letter-spacing: var(--letter-spacing-mono);
		color: var(--text-tertiary);
	}

	.section-header {
		display: flex;
		align-items: center;
		gap: var(--sp-3);
		margin-bottom: var(--sp-3);
	}

	.section-count {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: 20px;
		height: 18px;
		padding: 0 5px;
		border: 1px solid color-mix(in srgb, var(--border-default) 70%, var(--amber) 30%);
		background: color-mix(in srgb, var(--amber-light) 72%, var(--surface-panel) 28%);
		color: var(--amber-dark);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-semibold);
		border-radius: var(--radius-sm);
		line-height: 1;
	}

	/* ── Grouping view toggle ─────────────────────────────── */
	.view-toggle {
		margin-left: auto;
		display: flex;
		background: var(--ink-06);
		border-radius: var(--radius-sm);
		padding: 2px;
		gap: 1px;
	}

	.toggle-btn {
		font-family: var(--font-mono);
		font-size: 9px;
		text-transform: uppercase;
		letter-spacing: var(--letter-spacing-mono);
		color: var(--text-tertiary);
		background: transparent;
		border: none;
		padding: 2px 7px;
		border-radius: calc(var(--radius-sm) - 1px);
		cursor: pointer;
		line-height: 1.5;
		white-space: nowrap;
		transition:
			background 0.1s ease,
			color 0.1s ease;
	}

	.toggle-btn.active {
		background: var(--surface-panel);
		color: var(--text-primary);
		box-shadow: 0 1px 2px color-mix(in srgb, var(--ink) 8%, transparent);
	}

	.toggle-btn:hover:not(.active) {
		color: var(--text-secondary);
	}

	/* ── Group section headers ────────────────────────────── */
	.group-header {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		text-transform: uppercase;
		letter-spacing: var(--letter-spacing-mono);
		color: var(--text-tertiary);
		padding: var(--sp-3) 0 var(--sp-1);
		border-top: 1px solid var(--ink-06);
	}

	.group-header--first {
		padding-top: 0;
		border-top: none;
	}

	/* ── Primary split ────────────────────────────────────── */
	.primary-split {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: var(--sp-8);
		align-items: start;
		padding: var(--sp-6) 0;
	}

	.split-col {
		display: flex;
		flex-direction: column;
	}

	/* Out Today */
	.out-list {
		display: flex;
		flex-direction: column;
	}

	.out-row {
		display: grid;
		grid-template-columns: 1fr auto;
		align-items: center;
		gap: var(--sp-3);
		padding: var(--sp-2) 0;
		border-top: 1px solid var(--ink-06);
	}

	.out-row:first-child {
		border-top: none;
	}

	.person-identity {
		display: flex;
		align-items: baseline;
		gap: var(--sp-1);
		min-width: 0;
	}

	.person-rank {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		text-transform: uppercase;
		color: var(--text-tertiary);
		flex-shrink: 0;
	}

	.person-name {
		font-family: var(--font-body);
		font-size: var(--text-sm);
		color: var(--text-primary);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.status-label {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		text-transform: uppercase;
		letter-spacing: var(--letter-spacing-mono);
		padding: 2px 6px;
		border-radius: var(--radius-sm);
		white-space: nowrap;
		flex-shrink: 0;
	}

	/* Duty Roster */
	.duty-day {
		margin-bottom: var(--sp-4);
	}

	.duty-day--tomorrow {
		padding-top: var(--sp-4);
		border-top: 1px solid var(--ink-15);
	}

	.duty-day-label {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		text-transform: uppercase;
		letter-spacing: var(--letter-spacing-mono);
		color: var(--text-tertiary);
		margin-bottom: var(--sp-2);
	}

	.duty-row {
		display: grid;
		grid-template-columns: 1fr 1fr;
		align-items: baseline;
		gap: var(--sp-3);
		padding: var(--sp-2) 0;
		border-top: 1px solid var(--ink-06);
	}

	.duty-row:first-child {
		border-top: none;
	}

	.duty-type {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		text-transform: uppercase;
		letter-spacing: var(--letter-spacing-mono);
		color: var(--text-tertiary);
	}

	.duty-assignee {
		font-family: var(--font-body);
		font-size: var(--text-sm);
		color: var(--text-primary);
	}

	/* ── Upcoming Losses section ──────────────────────────────── */
	/*
	  Full-width strip between the daily-ops primary split and the
	  housekeeping secondary split. The top hairline marks the
	  transition from "today" data to "forward-looking" data.
	*/
	.losses-section {
		padding: var(--sp-6) 0 var(--sp-2);
		border-top: 1px solid var(--ink-15);
	}

	/* ── Secondary split ──────────────────────────────────── */
	.secondary-split {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: var(--sp-8);
		align-items: start;
		padding: var(--sp-8) 0 var(--sp-6);
		border-top: 1px solid var(--ink-15);
	}

	/* Onboarding */
	.onboarding-row {
		display: grid;
		grid-template-columns: 1fr 80px 32px;
		align-items: center;
		gap: var(--sp-2);
		padding: var(--sp-2) 0;
		border-top: 1px solid var(--ink-06);
	}

	.onboarding-row:first-child {
		border-top: none;
	}

	.onboarding-name {
		font-family: var(--font-body);
		font-size: var(--text-sm);
		color: var(--text-primary);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.onboarding-bar-track {
		height: 2px;
		background: var(--ink-15);
		overflow: hidden;
	}

	.onboarding-bar-fill {
		height: 100%;
	}

	.onboarding-pct {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		text-align: right;
		color: var(--text-tertiary);
	}

	/* Upcoming Changes */
	.upcoming-row {
		display: grid;
		grid-template-columns: 1fr auto auto;
		align-items: baseline;
		gap: var(--sp-3);
		padding: var(--sp-2) 0;
		border-top: 1px solid var(--ink-06);
	}

	.upcoming-row:first-child {
		border-top: none;
	}

	.upcoming-name {
		font-family: var(--font-body);
		font-size: var(--text-sm);
		color: var(--text-primary);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.upcoming-meta {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		text-transform: uppercase;
		letter-spacing: var(--letter-spacing-mono);
		color: var(--text-tertiary);
		white-space: nowrap;
	}

	.upcoming-reason {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		text-transform: uppercase;
		letter-spacing: var(--letter-spacing-mono);
		color: var(--text-secondary);
		white-space: nowrap;
	}

	.empty-mono {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		text-transform: uppercase;
		letter-spacing: var(--letter-spacing-mono);
		color: var(--text-tertiary);
		padding: var(--sp-4) 0;
		margin: 0;
	}

	/* ── Responsive ───────────────────────────────────────── */
	@media (max-width: 720px) {
		.primary-split,
		.secondary-split {
			grid-template-columns: 1fr;
			gap: var(--sp-6);
		}

		.secondary-split {
			padding-top: var(--sp-6);
		}
	}
</style>
