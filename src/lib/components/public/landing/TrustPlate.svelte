<script lang="ts">
	import { resolve } from '$app/paths';

	const specs = [
		{ label: 'Standard', value: 'NIST 800-171 aligned' },
		{ label: 'At rest', value: 'AES-256 encryption' },
		{ label: 'In transit', value: 'TLS 1.2 or higher' },
		{ label: 'Access', value: 'Role-based, scoped to a group' },
		{ label: 'Accountability', value: 'Security-relevant audit logs' },
		{ label: 'Entry', value: 'Every access request is reviewed' },
		{ label: 'Limit', value: 'Not authorized for classified information' }
	];
</script>

<section class="trust">
	<div class="l-wrap trust__layout">
		<h2 class="l-headline trust__title">Built for the data you actually handle.</h2>

		<!-- A data plate, like the one stamped on issued gear. -->
		<div class="trust__plate">
			<p class="l-eyebrow trust__strip">Handling personnel data</p>
			<dl class="trust__specs">
				{#each specs as spec (spec.label)}
					<div class="trust__spec">
						<dt>{spec.label}</dt>
						<dd>{spec.value}</dd>
					</div>
				{/each}
			</dl>
		</div>

		<div class="trust__note">
			<p class="l-body">
				TroopToTask is not an official Army system and doesn't replace required systems of record. It's the coordination
				layer around them.
			</p>
			<a class="trust__link" href={resolve('/security')}>Read the security overview</a>
		</div>
	</div>
</section>

<style>
	.trust {
		padding-block: clamp(5rem, 12vh, 9rem);
		background: var(--l-day-sunk);
		color: var(--l-ink);
	}

	.trust__layout {
		display: grid;
		grid-template-columns: minmax(0, 5fr) minmax(0, 6fr);
		grid-template-rows: auto 1fr;
		grid-template-areas:
			'title plate'
			'note plate';
		column-gap: clamp(2.5rem, 5vw, 4.5rem);
		row-gap: 2rem;
	}

	.trust__title {
		grid-area: title;
		font-size: clamp(2.25rem, 4vw, 3.5rem);
	}

	.trust__plate {
		grid-area: plate;
		max-width: 42rem;
		overflow: hidden;
		border: 1px solid var(--l-ink);
		border-radius: 4px;
		background: var(--l-day);
	}

	.trust__strip {
		padding: 0.9rem 1.5rem;
		background: var(--l-night);
		color: var(--l-night-text);
	}

	.trust__spec {
		display: grid;
		grid-template-columns: 8rem minmax(0, 1fr);
		column-gap: 1.5rem;
		align-items: baseline;
		padding: 1rem 1.5rem;
		border-top: 1px solid var(--l-day-line);
	}

	.trust__spec:first-child {
		border-top: 0;
	}

	/* The one limit sits under a heavier rule, apart from what the system does. */
	.trust__spec:last-child {
		border-top-color: var(--l-ink);
	}

	.trust__spec dt,
	.trust__spec dd {
		font-family: 'IBM Plex Mono', monospace;
		text-transform: uppercase;
	}

	.trust__spec dt {
		font-size: 0.6875rem;
		font-weight: 500;
		letter-spacing: 0.12em;
		color: var(--l-ink-muted);
	}

	.trust__spec dd {
		margin: 0;
		font-size: 0.9375rem;
		font-weight: 500;
		line-height: 1.45;
		letter-spacing: 0.03em;
	}

	.trust__note {
		grid-area: note;
		align-self: end;
	}

	.trust__note .l-body {
		color: var(--l-ink-muted);
	}

	.trust__link {
		display: inline-flex;
		align-items: center;
		min-height: 44px;
		margin-top: 0.75rem;
		color: var(--l-ink);
		font-family: 'Barlow Condensed', sans-serif;
		font-size: 1.125rem;
		font-weight: 600;
		letter-spacing: 0.04em;
		text-decoration: underline;
		text-decoration-thickness: 1px;
		text-underline-offset: 0.25em;
		text-transform: uppercase;
	}

	.trust__link:hover {
		text-decoration-thickness: 2px;
	}

	@media (max-width: 899px) {
		.trust__layout {
			grid-template-columns: minmax(0, 1fr);
			grid-template-rows: auto;
			grid-template-areas:
				'title'
				'plate'
				'note';
		}
	}

	@media (max-width: 559px) {
		.trust__strip,
		.trust__spec {
			padding-inline: 1rem;
		}

		.trust__spec {
			grid-template-columns: minmax(0, 1fr);
			row-gap: 0.35rem;
			padding-block: 0.8rem;
		}
	}
</style>
