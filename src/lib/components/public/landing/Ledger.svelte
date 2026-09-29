<script lang="ts">
	const items: { label: string; line: string; chip?: string }[] = [
		{
			label: 'Evaluations',
			line: 'Rating chains and due dates by rater. Expiring and expired evaluations surface on their own.',
			chip: 'Expiring (5d)'
		},
		{
			label: 'In-processing',
			line: 'Build a checklist template once. Every new arrival gets a tracked workflow, stage by stage.'
		},
		{ label: 'Counseling', line: 'Completed counselings filed with the Soldier, PDF included.' },
		{
			label: 'Follow-ups',
			line: 'Action items tied to a Soldier: counseling reminders, award recommendations, developmental goals.'
		},
		{ label: 'Sign-in rosters', line: 'Print a sign-in roster. Upload the signed scan.' },
		{
			label: 'Roster import',
			line: 'Bring your roster in from Excel or CSV. Map the columns, review the rows, import.'
		}
	];
</script>

<section class="ledger">
	<div class="l-wrap">
		<p class="l-eyebrow ledger__eyebrow">What's due?</p>
		<h2 class="l-headline ledger__title">Deadlines show up before they slip.</h2>
		<dl class="ledger__list">
			{#each items as item (item.label)}
				<div class="ledger__item">
					<dt>
						{item.label}
						{#if item.chip}
							<!-- A status chip as the app draws it; the line below already says it in words. -->
							<span class="ledger__chip" aria-hidden="true">{item.chip}</span>
						{/if}
					</dt>
					<dd>{item.line}</dd>
				</div>
			{/each}
		</dl>
	</div>
</section>

<style>
	.ledger {
		padding-block: clamp(5rem, 12vh, 9rem);
		border-top: 1px solid var(--l-day-line);
		background: var(--l-day-sunk);
	}

	.ledger__eyebrow {
		color: var(--l-ink-muted);
	}

	.ledger__title {
		margin-top: 1.25rem;
	}

	.ledger__list {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		column-gap: clamp(2rem, 5vw, 5rem);
		margin-top: clamp(2.5rem, 7vh, 4.5rem);
	}

	.ledger__item {
		display: grid;
		align-content: start;
		gap: 0.65rem;
		padding-block: 1.5rem 1.75rem;
		border-top: 1px solid var(--l-day-line);
	}

	.ledger__item dt {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.4rem 0.75rem;
		/* As tall as the chip, so labels line up across both columns. */
		min-height: 1.5rem;
		font-family: 'IBM Plex Mono', monospace;
		font-size: 0.75rem;
		font-weight: 600;
		line-height: 1.3;
		letter-spacing: 0.12em;
		text-transform: uppercase;
	}

	.ledger__item dd {
		max-width: 42ch;
		font-size: clamp(1.0625rem, 0.95rem + 0.35vw, 1.25rem);
		line-height: 1.5;
		text-wrap: pretty;
	}

	.ledger__chip {
		padding: 0.2rem 0.45rem;
		border: 1px solid color-mix(in oklch, var(--l-expiring-ink) 30%, var(--l-expiring-fill));
		border-radius: 2px;
		background: var(--l-expiring-fill);
		color: var(--l-expiring-ink);
		font-size: 0.6875rem;
		font-weight: 500;
		letter-spacing: 0.02em;
		text-transform: none;
	}

	@media (max-width: 699px) {
		.ledger__list {
			grid-template-columns: minmax(0, 1fr);
		}
	}
</style>
