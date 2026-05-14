<script lang="ts">
	import PrototypeSwitcher from '$lib/components/prototype/PrototypeSwitcher.svelte';

	interface Props {
		variant: 'A' | 'B' | 'C';
	}

	let { variant }: Props = $props();

	const variants = [
		{ key: 'A', label: 'Command Brief' },
		{ key: 'B', label: 'Workflow Map' },
		{ key: 'C', label: 'Trust Console' }
	];

	const readinessRows = [
		['Alpha Co', '91%', '3 losses', '2 training gaps'],
		['Bravo Co', '84%', '8 losses', '6 training gaps'],
		['HHC', '88%', '2 losses', '4 training gaps'],
		['Delta Co', '79%', '11 losses', '9 training gaps']
	];

	const lanes = [
		['Morning accountability', 'Who is present, unavailable, or missing from the brief.'],
		['Personnel movement', 'ETS, PCS / DEROS, onboarding, assignments, and gains.'],
		['Training readiness', 'Requirements, expirations, exemptions, and recurring checks.'],
		['Leader follow-through', 'Counseling, evals, duty rosters, and open actions.']
	];
</script>

<!-- PROTOTYPE: Three landing page redesign directions, switchable with `?variant=`, mounted on the existing `/` route. -->
<div class={`landing-prototype landing-prototype--${variant.toLowerCase()}`}>
	{#if variant === 'A'}
		<section class="brief-hero">
			<div class="brief-hero__copy">
				<p class="proto-label">Landing prototype A // Command brief</p>
				<h1>Unit readiness without the spreadsheet chase.</h1>
				<p>
					TroopToTask gives commanders, first sergeants, and staff a shared operational picture for personnel, training,
					duty, onboarding, and leader follow-through.
				</p>
				<div class="proto-actions">
					<a href="/auth/request-access" class="proto-button proto-button--primary">Request beta access</a>
					<a href="/features" class="proto-button">Review capabilities</a>
				</div>
			</div>

			<div class="brief-board" aria-label="Readiness brief preview">
				<div class="brief-board__header">
					<div>
						<span>BN READINESS BRIEF</span>
						<strong>0630L Update</strong>
					</div>
					<div class="brief-board__status">Live</div>
				</div>
				<div class="brief-board__metrics">
					<div><strong>412</strong><span>Assigned</span></div>
					<div><strong>87%</strong><span>Present</span></div>
					<div><strong>24</strong><span>Due soon</span></div>
				</div>
				<table>
					<thead>
						<tr><th>Element</th><th>Ready</th><th>Losses</th><th>Training</th></tr>
					</thead>
					<tbody>
						{#each readinessRows as row (row[0])}
							<tr>
								{#each row as cell (cell)}
									<td>{cell}</td>
								{/each}
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</section>

		<section class="brief-strip">
			<div>
				<span>01</span>
				<strong>Accountability</strong>
				<p>Know who is present, absent, attached, and expected back.</p>
			</div>
			<div>
				<span>02</span>
				<strong>Readiness</strong>
				<p>Track training and personnel gaps before they hit the slide deck.</p>
			</div>
			<div>
				<span>03</span>
				<strong>Continuity</strong>
				<p>Keep the same truth across shifts, shops, and leadership changes.</p>
			</div>
		</section>
	{:else if variant === 'B'}
		<section class="workflow-hero">
			<div class="workflow-hero__header">
				<p class="proto-label">Landing prototype B // Workflow map</p>
				<h1>One operating rhythm for the work behind the formation.</h1>
				<p>
					This direction sells the product through the daily leader loop: see the issue, assign the action, brief the
					status, and carry the record forward.
				</p>
			</div>

			<div class="workflow-map" aria-label="TroopToTask workflow map">
				{#each lanes as lane, index (lane[0])}
					<div class="workflow-lane">
						<div class="workflow-lane__number">{String(index + 1).padStart(2, '0')}</div>
						<div>
							<h2>{lane[0]}</h2>
							<p>{lane[1]}</p>
						</div>
						<div class="workflow-lane__artifact">
							<span>{index === 0 ? '0830' : index === 1 ? '180d' : index === 2 ? '30d' : 'Open'}</span>
							<strong>{index === 0 ? 'Formation' : index === 1 ? 'Warning' : index === 2 ? 'Expiring' : 'Queue'}</strong
							>
						</div>
					</div>
				{/each}
			</div>
		</section>

		<section class="workflow-cta">
			<div>
				<h2>Built around what leaders already ask every day.</h2>
				<p>
					No generic kanban board. No HR portal vocabulary. Just the unit questions that have to be answered cleanly.
				</p>
			</div>
			<a href="/auth/request-access" class="proto-button proto-button--primary">Start with your unit</a>
		</section>
	{:else}
		<section class="trust-hero">
			<div class="trust-console" aria-label="Security and control console preview">
				<div class="trust-console__top">
					<span>ACCESS CONTROL</span>
					<span>NIST 800-171 aligned</span>
				</div>
				<div class="trust-console__grid">
					<div>
						<strong>Role scope</strong>
						<p>Team leaders see their people. Staff sees the lanes they own. Admins retain audit visibility.</p>
					</div>
					<div>
						<strong>Audit trail</strong>
						<p>Personnel edits, exports, auth events, and sensitive workflow changes stay reviewable.</p>
					</div>
					<div>
						<strong>Data posture</strong>
						<p>Designed for unclassified personnel readiness work, not classified operations.</p>
					</div>
				</div>
			</div>

			<div class="trust-hero__copy">
				<p class="proto-label">Landing prototype C // Trust console</p>
				<h1>Controlled access for personnel readiness.</h1>
				<p>
					This direction leads with security, permissions, and controlled visibility for units that need confidence
					before they care about the feature list.
				</p>
				<div class="trust-proof">
					<span>Scoped permissions</span>
					<span>Audit logs</span>
					<span>Exportable records</span>
					<span>Multi-org support</span>
				</div>
			</div>
		</section>

		<section class="trust-band">
			<div><strong>For commanders</strong><span>Brief-ready personnel status.</span></div>
			<div><strong>For NCOs</strong><span>Action queues tied to real people.</span></div>
			<div><strong>For staff</strong><span>Exports and audit trails without side channels.</span></div>
		</section>
	{/if}

	<PrototypeSwitcher {variants} current={variant} />
</div>

<style>
	.landing-prototype {
		--proto-ink: var(--foreground);
		--proto-muted: var(--muted-foreground);
		--proto-line: var(--border);
		--proto-panel: var(--card);
		--proto-wash: color-mix(in srgb, var(--muted) 60%, var(--background) 40%);
		background: var(--background);
		color: var(--proto-ink);
		font-family: 'Source Serif 4', serif;
	}

	.proto-label {
		margin: 0 0 1rem;
		color: var(--accent);
		font-family: 'IBM Plex Mono', monospace;
		font-size: 0.75rem;
		font-weight: 700;
		letter-spacing: 0.12em;
		text-transform: uppercase;
	}

	.proto-button {
		display: inline-flex;
		min-height: 2.75rem;
		align-items: center;
		justify-content: center;
		border: 1px solid var(--proto-line);
		border-radius: var(--radius);
		padding: 0.7rem 1.1rem;
		color: var(--proto-ink);
		font-family: 'IBM Plex Mono', monospace;
		font-size: 0.76rem;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-decoration: none;
		text-transform: uppercase;
	}

	.proto-button--primary {
		border-color: var(--accent);
		background: var(--accent);
		color: var(--accent-foreground);
	}

	.proto-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.75rem;
	}

	.brief-hero {
		display: grid;
		grid-template-columns: minmax(0, 0.82fr) minmax(22rem, 1fr);
		gap: clamp(2rem, 5vw, 5rem);
		align-items: center;
		min-height: calc(100vh - 96px);
		padding: clamp(3rem, 6vw, 5.5rem) clamp(1rem, 5vw, 5rem) 2rem;
		border-bottom: 1px solid var(--proto-line);
	}

	.brief-hero h1,
	.workflow-hero h1,
	.trust-hero h1 {
		max-width: 11ch;
		margin: 0;
		font-family: 'Barlow Condensed', sans-serif;
		font-size: clamp(4.5rem, 12vw, 9.25rem);
		font-weight: 800;
		letter-spacing: 0;
		line-height: 0.84;
		text-transform: uppercase;
	}

	.brief-hero__copy > p:not(.proto-label),
	.workflow-hero__header > p:not(.proto-label),
	.trust-hero__copy > p:not(.proto-label) {
		max-width: 42rem;
		margin: 1.5rem 0;
		color: var(--proto-muted);
		font-size: clamp(1.05rem, 1.8vw, 1.32rem);
		line-height: 1.55;
	}

	.brief-board,
	.trust-console {
		border: 1px solid color-mix(in srgb, var(--foreground) 16%, transparent);
		border-radius: calc(var(--radius) + 2px);
		background: var(--proto-panel);
		box-shadow: 0 26px 80px rgb(0 0 0 / 0.12);
		overflow: hidden;
	}

	.brief-board__header,
	.brief-board__metrics,
	.trust-console__top {
		display: flex;
		justify-content: space-between;
		gap: 1rem;
		border-bottom: 1px solid var(--proto-line);
		padding: 1rem;
		font-family: 'IBM Plex Mono', monospace;
	}

	.brief-board__header span,
	.trust-console__top span {
		display: block;
		color: var(--proto-muted);
		font-size: 0.68rem;
		letter-spacing: 0.1em;
		text-transform: uppercase;
	}

	.brief-board__status {
		align-self: start;
		border: 1px solid color-mix(in srgb, var(--accent) 36%, transparent);
		padding: 0.2rem 0.55rem;
		color: var(--accent);
		font-size: 0.72rem;
		text-transform: uppercase;
	}

	.brief-board__metrics {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		padding: 0;
	}

	.brief-board__metrics div {
		padding: 1rem;
		border-right: 1px solid var(--proto-line);
	}

	.brief-board__metrics div:last-child {
		border-right: 0;
	}

	.brief-board__metrics strong {
		display: block;
		font-family: 'Barlow Condensed', sans-serif;
		font-size: 2.4rem;
		line-height: 1;
	}

	.brief-board__metrics span {
		color: var(--proto-muted);
		font-size: 0.68rem;
		text-transform: uppercase;
	}

	.brief-board table {
		width: 100%;
		border-collapse: collapse;
		font-family: 'IBM Plex Mono', monospace;
		font-size: 0.78rem;
	}

	.brief-board th,
	.brief-board td {
		border-bottom: 1px solid var(--proto-line);
		padding: 0.8rem 1rem;
		text-align: left;
	}

	.brief-board th {
		color: var(--proto-muted);
		font-size: 0.65rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	.brief-strip,
	.trust-band,
	.workflow-cta {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		border-bottom: 1px solid var(--proto-line);
	}

	.brief-strip div,
	.trust-band div {
		min-height: 12rem;
		border-right: 1px solid var(--proto-line);
		padding: clamp(1.25rem, 3vw, 2rem);
	}

	.brief-strip span {
		color: var(--accent);
		font-family: 'IBM Plex Mono', monospace;
		font-size: 0.75rem;
	}

	.brief-strip strong,
	.trust-band strong {
		display: block;
		margin-top: 1.4rem;
		font-family: 'Barlow Condensed', sans-serif;
		font-size: 2.2rem;
		line-height: 1;
		text-transform: uppercase;
	}

	.brief-strip p,
	.trust-band span {
		display: block;
		max-width: 21rem;
		color: var(--proto-muted);
	}

	.workflow-hero {
		min-height: calc(100vh - 96px);
		padding: clamp(3rem, 6vw, 5.5rem) clamp(1rem, 5vw, 5rem);
		background: linear-gradient(90deg, var(--background) 0 38%, var(--proto-wash) 38% 100%);
	}

	.workflow-hero__header {
		display: grid;
		grid-template-columns: minmax(0, 0.9fr) minmax(18rem, 0.7fr);
		gap: clamp(1rem, 4vw, 4rem);
		align-items: end;
		margin-bottom: clamp(2rem, 5vw, 4rem);
	}

	.workflow-map {
		display: grid;
		gap: 0.75rem;
	}

	.workflow-lane {
		display: grid;
		grid-template-columns: 5rem minmax(0, 1fr) minmax(8rem, 0.22fr);
		align-items: stretch;
		border: 1px solid var(--proto-line);
		background: color-mix(in srgb, var(--card) 92%, transparent);
	}

	.workflow-lane__number,
	.workflow-lane__artifact {
		display: grid;
		place-items: center;
		border-right: 1px solid var(--proto-line);
		font-family: 'IBM Plex Mono', monospace;
	}

	.workflow-lane > div:nth-child(2) {
		padding: 1.2rem 1.5rem;
	}

	.workflow-lane h2 {
		margin: 0;
		font-family: 'Barlow Condensed', sans-serif;
		font-size: clamp(1.8rem, 4vw, 3.6rem);
		line-height: 0.95;
		text-transform: uppercase;
	}

	.workflow-lane p {
		max-width: 42rem;
		margin: 0.45rem 0 0;
		color: var(--proto-muted);
	}

	.workflow-lane__artifact {
		border-right: 0;
		border-left: 1px solid var(--proto-line);
		text-align: center;
	}

	.workflow-lane__artifact span {
		color: var(--accent);
		font-size: 1.15rem;
		font-weight: 800;
	}

	.workflow-lane__artifact strong {
		color: var(--proto-muted);
		font-size: 0.65rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	.workflow-cta {
		grid-template-columns: minmax(0, 1fr) auto;
		align-items: center;
		gap: 1.5rem;
		padding: clamp(1.5rem, 4vw, 3rem) clamp(1rem, 5vw, 5rem);
	}

	.workflow-cta h2 {
		margin: 0;
		font-family: 'Barlow Condensed', sans-serif;
		font-size: clamp(2.4rem, 5vw, 4.5rem);
		line-height: 0.92;
		text-transform: uppercase;
	}

	.workflow-cta p {
		max-width: 48rem;
		color: var(--proto-muted);
	}

	.trust-hero {
		display: grid;
		grid-template-columns: minmax(22rem, 0.95fr) minmax(0, 0.75fr);
		gap: clamp(2rem, 5vw, 5rem);
		align-items: center;
		min-height: calc(100vh - 96px);
		padding: clamp(3rem, 6vw, 5.5rem) clamp(1rem, 5vw, 5rem);
		background: var(--foreground);
		color: var(--background);
	}

	.trust-hero .proto-label,
	.trust-hero__copy > p:not(.proto-label) {
		color: color-mix(in srgb, var(--background) 72%, var(--accent) 28%);
	}

	.trust-hero h1 {
		max-width: 9ch;
		font-size: clamp(3.75rem, 7vw, 5.8rem);
	}

	.trust-console {
		--proto-line: color-mix(in srgb, var(--background) 16%, transparent);
		--proto-muted: color-mix(in srgb, var(--background) 66%, transparent);
		background: color-mix(in srgb, var(--foreground) 80%, black 20%);
		color: var(--background);
		box-shadow: none;
	}

	.trust-console__grid {
		display: grid;
		grid-template-columns: 1fr;
	}

	.trust-console__grid div {
		border-bottom: 1px solid var(--proto-line);
		padding: clamp(1.25rem, 3vw, 2rem);
	}

	.trust-console__grid strong {
		display: block;
		font-family: 'Barlow Condensed', sans-serif;
		font-size: clamp(2rem, 4vw, 3.4rem);
		line-height: 0.95;
		text-transform: uppercase;
	}

	.trust-console__grid p {
		max-width: 34rem;
		color: var(--proto-muted);
	}

	.trust-proof {
		display: flex;
		flex-wrap: wrap;
		gap: 0.65rem;
	}

	.trust-proof span {
		border: 1px solid color-mix(in srgb, var(--background) 18%, transparent);
		padding: 0.45rem 0.65rem;
		color: var(--background);
		font-family: 'IBM Plex Mono', monospace;
		font-size: 0.68rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	.trust-band {
		background: var(--foreground);
		color: var(--background);
		border-color: color-mix(in srgb, var(--background) 16%, transparent);
	}

	.trust-band div {
		border-color: color-mix(in srgb, var(--background) 16%, transparent);
	}

	.trust-band span {
		color: color-mix(in srgb, var(--background) 70%, transparent);
	}

	@media (max-width: 900px) {
		.brief-hero,
		.workflow-hero__header,
		.trust-hero {
			grid-template-columns: 1fr;
		}

		.brief-strip,
		.trust-band {
			grid-template-columns: 1fr;
		}

		.brief-strip div,
		.trust-band div {
			min-height: 0;
			border-right: 0;
			border-bottom: 1px solid var(--proto-line);
		}

		.workflow-hero {
			background: var(--background);
		}

		.workflow-lane {
			grid-template-columns: 3.25rem minmax(0, 1fr);
		}

		.workflow-lane__artifact {
			grid-column: 1 / -1;
			grid-template-columns: auto auto;
			justify-content: start;
			gap: 0.75rem;
			border-top: 1px solid var(--proto-line);
			border-left: 0;
			padding: 0.75rem 1rem;
		}

		.workflow-cta {
			grid-template-columns: 1fr;
		}
	}

	@media (max-width: 560px) {
		.brief-hero,
		.workflow-hero,
		.trust-hero {
			min-height: 0;
			padding-block: 3rem;
		}

		.brief-hero h1,
		.workflow-hero h1,
		.trust-hero h1 {
			font-size: clamp(3.8rem, 20vw, 5.6rem);
		}

		.brief-board {
			overflow-x: auto;
		}

		.brief-board__metrics {
			grid-template-columns: 1fr;
		}

		.brief-board__metrics div {
			border-right: 0;
			border-bottom: 1px solid var(--proto-line);
		}

		.proto-actions {
			flex-direction: column;
		}
	}
</style>
