<script lang="ts">
	import type { Personnel, TrainingType, PersonnelTraining } from '../types';
	import { getTrainingStatus } from '../utils/trainingStatus';

	interface Props {
		personnel: Personnel[];
		trainingTypes: TrainingType[];
		trainings: PersonnelTraining[];
		onCellClick?: (person: Personnel, type: TrainingType, training: PersonnelTraining | undefined) => void;
		onPersonClick?: (person: Personnel) => void;
	}

	let { personnel, trainingTypes, trainings, onCellClick, onPersonClick }: Props = $props();

	// Create a map for quick training lookup
	const trainingMap = $derived(() => {
		const map = new Map<string, PersonnelTraining>();
		for (const t of trainings) {
			map.set(`${t.personnelId}-${t.trainingTypeId}`, t);
		}
		return map;
	});

	function getTraining(personnelId: string, typeId: string) {
		return trainingMap().get(`${personnelId}-${typeId}`);
	}
</script>

<div class="matrix-container">
	<table class="matrix">
		<thead>
			<tr>
				<th class="name-header">Personnel</th>
				{#each trainingTypes as type (type.id)}
					<th class="type-header">
						<span class="type-name" style="background-color: {type.color}">
							{type.name}
						</span>
					</th>
				{/each}
			</tr>
		</thead>
		<tbody>
			{#each personnel as person (person.id)}
				<tr>
					<td class="name-cell">
						{#if onPersonClick}
							<button class="person-btn" onclick={() => onPersonClick(person)}>
								<span class="person-rank">{person.rank}</span>
								{person.lastName}, {person.firstName}
							</button>
						{:else}
							<span class="person-rank">{person.rank}</span>
							{person.lastName}, {person.firstName}
						{/if}
					</td>
					{#each trainingTypes as type (type.id)}
						{@const training = getTraining(person.id, type.id)}
						{@const statusInfo = getTrainingStatus(training, type, person)}
						<td class="status-cell">
							{#if onCellClick}
								<button
									class="status-badge"
									style="background-color: {statusInfo.color}"
									onclick={() => onCellClick(person, type, training)}
								>
									{statusInfo.label}
								</button>
							{:else}
								<span class="status-badge" style="background-color: {statusInfo.color}">
									{statusInfo.label}
								</span>
							{/if}
							{#if training?.completionDate}
								<span class="completion-date">{training.completionDate}</span>
							{/if}
						</td>
					{/each}
				</tr>
			{/each}
		</tbody>
	</table>
</div>

<style>
	.matrix-container {
		overflow: auto;
		max-height: 100%;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		background: var(--color-surface);
	}

	.matrix {
		width: 100%;
		border-collapse: collapse;
		font-size: var(--font-size-sm);
	}

	.matrix thead {
		position: sticky;
		top: 0;
		z-index: 10;
		background: var(--color-surface);
	}

	.matrix th,
	.matrix td {
		padding: var(--spacing-sm);
		border-bottom: 1px solid var(--color-border);
		text-align: center;
		white-space: nowrap;
	}

	.name-header,
	.name-cell {
		position: sticky;
		left: 0;
		background: var(--color-surface);
		z-index: 5;
		text-align: left;
		min-width: 180px;
		border-right: 2px solid var(--color-border);
		color: var(--color-text);
	}

	.name-header {
		z-index: 15;
	}

	.type-header {
		min-width: 100px;
		vertical-align: bottom;
	}

	.type-name {
		display: inline-block;
		padding: var(--spacing-xs) var(--spacing-sm);
		border-radius: var(--radius-sm);
		color: white;
		font-weight: 500;
		font-size: var(--font-size-sm);
	}

	.person-btn {
		display: flex;
		align-items: center;
		width: 100%;
		padding: 0;
		background: transparent;
		border: none;
		text-align: left;
		cursor: pointer;
		color: var(--color-text);
		font-size: inherit;
	}

	.person-btn:hover {
		color: var(--color-primary);
	}

	.person-btn:hover .person-rank {
		color: var(--color-primary);
	}

	.person-rank {
		display: inline-block;
		font-weight: 600;
		color: var(--color-text-muted);
		min-width: 35px;
		margin-right: var(--spacing-xs);
	}

	.status-cell {
		vertical-align: middle;
	}

	.status-badge {
		display: inline-block;
		padding: var(--spacing-xs) var(--spacing-sm);
		border-radius: var(--radius-sm);
		color: white;
		font-weight: 500;
		font-size: var(--font-size-sm);
		cursor: pointer;
		border: none;
		transition: opacity 0.15s ease;
	}

	.status-badge:hover {
		opacity: 0.8;
	}

	.completion-date {
		display: block;
		font-size: 10px;
		color: var(--color-text-muted);
		margin-top: 2px;
	}

	tr:hover .name-cell,
	tr:hover td {
		background-color: var(--color-bg);
	}

	tr:hover .name-cell {
		background-color: var(--color-bg);
	}

	/* Mobile Responsive Styles */
	@media (max-width: 640px) {
		.name-header,
		.name-cell {
			min-width: 100px;
			max-width: 100px;
			width: 100px;
			font-size: var(--font-size-xs);
			padding: var(--spacing-xs);
			white-space: nowrap;
			overflow: hidden;
			text-overflow: ellipsis;
		}

		.type-header {
			min-width: 60px;
		}

		.type-name {
			font-size: 9px;
			padding: 2px 4px;
			white-space: nowrap;
		}

		.person-rank {
			min-width: 24px;
			font-size: var(--font-size-xs);
			margin-right: 2px;
		}

		.status-cell {
			min-width: 60px;
			min-height: 44px; /* Touch target */
		}

		.status-badge {
			font-size: var(--font-size-xs);
			padding: var(--spacing-xs);
		}

		.completion-date {
			font-size: 9px;
		}
	}

	/* Tablet Responsive Styles */
	@media (min-width: 641px) and (max-width: 1024px) {
		.name-header,
		.name-cell {
			min-width: 140px;
		}

		.type-header {
			min-width: 80px;
		}
	}
</style>
