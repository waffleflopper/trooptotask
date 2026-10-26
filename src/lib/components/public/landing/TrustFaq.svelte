<script lang="ts">
	import * as Accordion from '$lib/components/ui/accordion';
	import PublicHeading from '../PublicHeading.svelte';
	import PublicSection from '../PublicSection.svelte';
	import { body, monoLabel } from '../layout';

	const controls = [
		{ name: 'NIST 800-171', value: 'Aligned controls' },
		{ name: 'AES-256', value: 'Encryption at rest' },
		{ name: 'TLS 1.2+', value: 'In transit' },
		{ name: 'ROLES', value: 'Group-scoped access' },
		{ name: 'AUDIT', value: 'Security-relevant logs' }
	];

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
			question: 'I already have my roster in a spreadsheet. Do I have to re-enter everyone?',
			answer:
				'Upload an Excel or CSV roster, map its columns to the right personnel fields, and review the rows before importing. Name, rank, MOS, section and other roster details come from your existing file.'
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
</script>

<PublicSection id="faq" class="gap-16 lg:flex-row lg:gap-16 xl:gap-24">
	<div class="flex shrink-0 flex-col gap-12 lg:w-[360px] xl:w-[420px]">
		<PublicHeading label="BEFORE YOU HAND OVER THE ROSTER" lines={['FAIR', 'QUESTIONS.']} />
		<dl class="border-t-2 border-foreground">
			{#each controls as control (control.name)}
				<div class="flex min-h-12 items-center justify-between gap-4 border-b border-border">
					<dt class={monoLabel}>{control.name}</dt>
					<dd class="font-body text-lg leading-[1.375rem] font-light text-muted-foreground">{control.value}</dd>
				</div>
			{/each}
		</dl>
		<p class={[body, 'text-muted-foreground']}>
			Built for the administrative and personnel data that runs a unit day to day. Not authorized for classified
			information.
		</p>
	</div>
	<Accordion.Root type="single" value="2" class="grow self-start border-t-2 border-foreground">
		{#each faqs as faq, i (faq.question)}
			<Accordion.Item value={String(i)} class="border-b border-border">
				<Accordion.Trigger
					indicator="sign"
					class="items-center gap-6 rounded-none py-[22px] font-body text-lg leading-[1.375rem] font-normal text-foreground hover:no-underline"
				>
					{faq.question}
				</Accordion.Trigger>
				<Accordion.Content class="pb-[22px]">
					<p class={[body, 'max-w-[620px] text-muted-foreground']}>{faq.answer}</p>
				</Accordion.Content>
			</Accordion.Item>
		{/each}
	</Accordion.Root>
</PublicSection>
