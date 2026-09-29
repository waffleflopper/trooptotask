<script lang="ts">
	// Newest first. The top two arrive while you scroll and push the rest down.
	const MAIL = [
		{ from: 'SFC Bryant', subject: "URGENT: who's on the range Friday?", time: '01:58', unread: true, clip: false },
		{ from: 'SFC Powell', subject: 'RE: RE: FW: Updated roster (FINAL)', time: '23:12', unread: true, clip: true },
		{ from: 'SSG Vega', subject: 'Training dates: which version?', time: '21:47', unread: true, clip: true },
		{ from: 'CPT Dawson', subject: 'Brief slides for Monday, need by 1800', time: '14:05', unread: false, clip: true },
		{ from: '1SG Holland', subject: 'Leave chart, corrected', time: 'Sat', unread: false, clip: true }
	];

	const FOLDERS = ['Drafts', 'Sent Items', 'Deleted Items', 'Archive'];
</script>

<div class="inbox">
	<p class="bar">Inbox</p>
	<ul class="folders">
		<li class="current">Inbox <span class="badge">37</span></li>
		{#each FOLDERS as folder (folder)}
			<li>{folder}</li>
		{/each}
	</ul>
	<ol class="list">
		{#each MAIL as mail (mail.subject)}
			<li class={['mail', { unread: mail.unread, clip: mail.clip }]}>
				<span class="from">{mail.from}</span>
				<span class="time">{mail.time}</span>
				<span class="subject">{mail.subject}</span>
			</li>
		{/each}
	</ol>
</div>

<style>
	.inbox {
		/* Two new messages land during the night beats. */
		--first: clamp(0, calc((var(--p) - 0.17) / 0.03), 1);
		--second: clamp(0, calc((var(--p) - 0.47) / 0.03), 1);
		--mail-h: 3.2em;
		display: grid;
		grid-template-columns: 9.5em 1fr;
		grid-template-rows: auto calc(5 * var(--mail-h));
		width: 38em;
		overflow: hidden;
		border: 1px solid oklch(50% 0.08 250);
		background: oklch(98% 0.004 250);
		color: oklch(28% 0.02 250);
		font-family: var(--l-office-font);
		font-size: 0.8em;
		line-height: 1.35;
		white-space: nowrap;
	}

	.bar {
		grid-column: 1 / -1;
		position: relative;
		padding: 0.35em 0.9em;
		background: var(--l-office-mail);
		color: oklch(98% 0.004 250);
		font-weight: 700;
	}

	/* The search box. */
	.bar::after {
		content: 'Search';
		position: absolute;
		top: 0.3em;
		bottom: 0.3em;
		left: 34%;
		width: 42%;
		padding-left: 0.7em;
		border-radius: 2px;
		background: oklch(92% 0.03 250);
		color: oklch(50% 0.04 250);
		font-weight: 400;
		font-size: 0.9em;
		line-height: 1.6;
	}

	.folders {
		margin: 0;
		padding: 0.6em 0;
		list-style: none;
		border-right: 1px solid oklch(88% 0.01 250);
		background: oklch(95.5% 0.006 250);
	}

	.folders li {
		padding: 0.25em 0.9em;
	}

	.current {
		display: flex;
		justify-content: space-between;
		background: oklch(88% 0.04 250);
		font-weight: 700;
	}

	.badge {
		padding: 0 0.45em;
		border-radius: 1em;
		background: var(--l-office-mail);
		color: oklch(98% 0.004 250);
	}

	.list {
		margin: 0;
		padding: 0;
		list-style: none;
		overflow: hidden;
	}

	.mail {
		display: grid;
		grid-template-columns: 1fr auto;
		align-content: center;
		column-gap: 1em;
		height: var(--mail-h);
		box-sizing: border-box;
		padding: 0 0.9em 0 0.75em;
		border-bottom: 1px solid oklch(90% 0.008 250);
		border-left: 0.2em solid transparent;
		background: oklch(98% 0.004 250);
	}

	.mail:nth-child(1) {
		opacity: var(--second);
	}

	.mail:nth-child(2) {
		opacity: var(--first);
		transform: translateY(calc((var(--second) - 1) * var(--mail-h)));
	}

	.mail:nth-child(n + 3) {
		transform: translateY(calc((var(--first) + var(--second) - 2) * var(--mail-h)));
	}

	.unread {
		border-left-color: var(--l-office-mail);
	}

	.unread .from {
		font-weight: 700;
	}

	.unread .subject {
		color: var(--l-office-mail);
		font-weight: 700;
	}

	.time {
		color: oklch(48% 0.02 250);
	}

	.subject {
		grid-column: 1 / -1;
		overflow: hidden;
		padding-right: 1.4em;
		text-overflow: ellipsis;
	}

	/* Paperclip. */
	.clip .subject::after {
		content: '';
		position: absolute;
		right: 1.1em;
		margin-top: 0.15em;
		width: 0.35em;
		height: 0.8em;
		border: 1px solid oklch(45% 0.02 250);
		border-radius: 1em;
		transform: rotate(35deg);
	}

	.clip {
		position: relative;
	}
</style>
