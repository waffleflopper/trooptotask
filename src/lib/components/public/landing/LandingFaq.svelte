<script lang="ts">
	const faqs = [
		{
			question: 'Are the calendar statuses fixed, or can I define my own?',
			answer:
				'You define every status yourself: the name, the color, and whether it marks a day as a unit closure (like a training holiday or DONSA). If your unit has a status called "PDHA/PDHRA" or "Rear D," that\'s exactly what you\'ll see on the calendar. Your formation, your language.'
		},
		{
			question: 'Can I scope access so squad leaders only see their people?',
			answer:
				"Yes. When you invite someone to your organization, you can scope their access to a specific group. Group-scoped access can let leaders update statuses for their Soldiers and track training, but they won't see counseling records, onboarding checklists, or personnel data for anyone outside their group. They get exactly the visibility they need to do their job."
		},
		{
			question: 'I already have my roster in a spreadsheet. Do I have to re-enter everyone by hand?',
			answer:
				'Upload an Excel or CSV roster, map its columns to the right personnel fields, and review the rows before importing. Name, rank, MOS, section, and other roster details can come from your existing file.'
		},
		{
			question: 'What kind of training data can I track?',
			answer:
				"Anything your unit requires. You create training types and set their expiration and warning windows. TroopToTask then tracks every Soldier against them and color-codes the matrix for current, approaching expiration, and overdue records using each type's settings. You can mark Soldiers as exempt, track pass/fail or attendance, and export a training report for your briefing."
		},
		{
			question: 'Can I export data, or does everything stay locked inside the app?',
			answer:
				'You can export personnel rosters, training reports, and calendars to Excel. Calendar exports retain status colors; training reports include readable status labels. Independent sign-in rosters can be printed from the browser.'
		},
		{
			question: 'Is this secure enough for personnel data?',
			answer:
				'TroopToTask aligns to NIST 800-171 with AES-256 encryption at rest, TLS 1.2+ in transit, role-based access control with group scoping, and security-relevant audit logs for accountability and review. It is not authorized for classified information, but for the administrative and personnel data that runs your day-to-day operations, the controls are where they need to be.'
		}
	];

	const uid = $props.id();

	/** Index of the one open answer, or -1 when every answer is closed. */
	let open = $state(-1);
</script>

<section class="faq" id="faq">
	<div class="l-wrap faq__layout">
		<div>
			<p class="l-eyebrow faq__eyebrow">Frequently asked</p>
			<h2 class="l-headline faq__title">The questions people ask before they hand over the roster.</h2>
		</div>

		<div class="faq__list">
			{#each faqs as faq, index (faq.question)}
				<div class="faq__item">
					<h3>
						<button
							type="button"
							class="faq__trigger"
							aria-expanded={open === index}
							aria-controls="{uid}-answer-{index}"
							onclick={() => (open = open === index ? -1 : index)}
						>
							<span class="faq__question">{faq.question}</span>
							<span class="faq__mark" aria-hidden="true"></span>
						</button>
					</h3>
					<div class="faq__answer" id="{uid}-answer-{index}" hidden={open !== index}>
						<p>{faq.answer}</p>
					</div>
				</div>
			{/each}
		</div>
	</div>
</section>

<style>
	.faq {
		/* The fixed site nav is 56px tall. */
		scroll-margin-top: 4.5rem;
		padding-block: clamp(5rem, 12vh, 9rem);
		background: var(--l-day);
		color: var(--l-ink);
	}

	.faq__layout {
		display: grid;
		grid-template-columns: minmax(0, 5fr) minmax(0, 6fr);
		column-gap: clamp(2.5rem, 5vw, 4.5rem);
		row-gap: 2.5rem;
		align-items: start;
	}

	.faq__eyebrow {
		color: var(--l-ink-muted);
	}

	.faq__title {
		margin-top: 1rem;
		font-size: clamp(2.25rem, 4vw, 3.5rem);
	}

	.faq__item {
		border-bottom: 1px solid var(--l-day-line);
	}

	.faq__item:first-child {
		border-top: 1px solid var(--l-ink);
	}

	.faq__trigger {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 1.5rem;
		width: 100%;
		padding: 1.2rem 0;
		border: 0;
		background: none;
		color: var(--l-ink);
		cursor: pointer;
		font-family: 'Barlow Condensed', sans-serif;
		font-size: clamp(1.1875rem, 1rem + 0.45vw, 1.4375rem);
		font-weight: 600;
		line-height: 1.2;
		letter-spacing: 0.01em;
		text-align: left;
	}

	.faq__trigger:hover .faq__question {
		text-decoration: underline;
		text-decoration-thickness: 1px;
		text-underline-offset: 0.2em;
	}

	/* Plus when closed, minus when open. */
	.faq__mark {
		position: relative;
		flex: none;
		width: 0.75rem;
		height: 0.75rem;
		color: var(--l-ink-muted);
	}

	.faq__trigger:hover .faq__mark,
	.faq__trigger[aria-expanded='true'] .faq__mark {
		color: var(--l-ink);
	}

	.faq__mark::before,
	.faq__mark::after {
		content: '';
		position: absolute;
		background: currentColor;
	}

	.faq__mark::before {
		inset: calc(50% - 1px) 0;
	}

	.faq__mark::after {
		inset: 0 calc(50% - 1px);
	}

	.faq__trigger[aria-expanded='true'] .faq__mark::after {
		transform: scaleY(0);
	}

	.faq__answer p {
		max-width: 65ch;
		padding: 0 2.25rem 1.5rem 0;
		color: var(--l-ink-muted);
		font-size: 1.0625rem;
		line-height: 1.6;
		text-wrap: pretty;
	}

	@media (max-width: 899px) {
		.faq__layout {
			grid-template-columns: minmax(0, 1fr);
		}

		.faq__answer p {
			padding-right: 0;
		}
	}
</style>
