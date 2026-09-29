<script lang="ts">
	interface Props {
		text: string;
		tone?: 'yellow' | 'orange';
		/** Red marker instead of pen, for the one that matters most. */
		urgent?: boolean;
	}

	let { text, tone = 'yellow', urgent = false }: Props = $props();
</script>

<p class={['note', tone, { urgent }]}>{text}</p>

<style>
	/* Sized in its own em so the square stays about 9.5em of the pile whatever the handwriting size. */
	.note {
		width: 6.6em;
		height: 6.6em;
		box-sizing: border-box;
		padding: 0.6em 0.55em;
		border: 1px solid oklch(78% 0.1 90);
		background: var(--l-office-sticky);
		color: oklch(30% 0.08 262);
		font-family: var(--l-office-hand);
		font-size: 1.45em;
		font-weight: 700;
		line-height: 1.2;
		text-wrap: balance;
	}

	.orange {
		border-color: oklch(76% 0.08 55);
		background: var(--l-office-sticky-alt);
	}

	.urgent {
		width: 5.6em;
		height: 5.6em;
		color: var(--l-office-marker-red);
		font-size: 1.7em;
	}
</style>
