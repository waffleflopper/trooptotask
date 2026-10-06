<script lang="ts">
	import * as OnboardingPacketList from './index';

	let expanded = $state('packet-a');
	let notesOpen = $state(false);
</script>

<OnboardingPacketList.Root bind:value={expanded}>
	<OnboardingPacketList.Item value="packet-a">
		<OnboardingPacketList.Trigger>
			<OnboardingPacketList.Summary>
				<OnboardingPacketList.SummaryTitle title="Jordan Lee" meta={['Initial Entry', 'HQ', 'Started May 1, 2026']} />
				{#snippet progress()}
					<OnboardingPacketList.Progress value={1} max={2} />
				{/snippet}
			</OnboardingPacketList.Summary>
		</OnboardingPacketList.Trigger>
		<OnboardingPacketList.Content>
			<OnboardingPacketList.StepList>
				<OnboardingPacketList.Step label="Complete sponsor brief" typeLabel="Checkbox" tone="checkbox" state="complete">
					{#snippet status()}
						<OnboardingPacketList.StatusIcon state="complete" label="Complete" />
					{/snippet}
					<OnboardingPacketList.Notes bind:open={notesOpen} count={2} readOnly>
						<OnboardingPacketList.Note text="Bring packet to S1." time="May 1" />
						<OnboardingPacketList.Note text="Sponsor assigned." time="May 2" />
					</OnboardingPacketList.Notes>
				</OnboardingPacketList.Step>

				<OnboardingPacketList.Step label="Cyber Awareness" typeLabel="Training" tone="training" state="incomplete">
					{#snippet status()}
						<OnboardingPacketList.StatusIcon state="incomplete" label="Incomplete" />
					{/snippet}
				</OnboardingPacketList.Step>

				<OnboardingPacketList.Step
					label="Legacy welcome form"
					typeLabel="Removed"
					tone="inactive"
					state="inactive"
					inactiveNote="Removed from template"
				/>
			</OnboardingPacketList.StepList>
		</OnboardingPacketList.Content>
	</OnboardingPacketList.Item>

	<OnboardingPacketList.Item value="packet-b">
		<OnboardingPacketList.Trigger>
			<OnboardingPacketList.Summary>
				<OnboardingPacketList.SummaryTitle title="Morgan Price" meta={['Officer Transfer', 'A Co']} />
				{#snippet progress()}
					<OnboardingPacketList.Progress value={1} max={1} label="1/1 complete" />
				{/snippet}
			</OnboardingPacketList.Summary>
		</OnboardingPacketList.Trigger>
		<OnboardingPacketList.Content>
			<OnboardingPacketList.StepList>
				<OnboardingPacketList.Step label="All steps complete" typeLabel="Checkbox" tone="checkbox" state="complete">
					{#snippet status()}
						<OnboardingPacketList.StatusIcon state="complete" label="Complete" />
					{/snippet}
				</OnboardingPacketList.Step>
			</OnboardingPacketList.StepList>
		</OnboardingPacketList.Content>
	</OnboardingPacketList.Item>
</OnboardingPacketList.Root>
