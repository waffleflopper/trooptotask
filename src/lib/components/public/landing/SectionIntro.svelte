<script lang="ts">
	import { body, display, eyebrow as eyebrowClass } from './type';

	interface Props {
		eyebrow: string;
		lines: string[];
		lead: string;
		dark?: boolean;
	}

	let { eyebrow, lines, lead, dark = false }: Props = $props();
</script>

<div class="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between lg:gap-16">
	<div class="flex flex-col gap-6">
		<p class={[eyebrowClass, dark ? 'text-chrome-accent' : 'text-accent-text']}>{eyebrow}</p>
		<h2 class={[display, dark ? 'text-chrome-text' : 'text-foreground']}>
			{#each lines as line (line)}<span class="block">{line}</span>{/each}
		</h2>
	</div>
	<p class={[body, 'shrink-0 lg:w-[340px] xl:w-[420px]', dark ? 'text-chrome-text-muted' : 'text-muted-foreground']}>
		{lead}
	</p>
</div>
