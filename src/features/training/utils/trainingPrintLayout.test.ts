import { describe, expect, it } from 'vitest';
import { chunkPrintColumns } from './trainingPrintLayout';

interface Row {
	label: string;
	percent: number | null;
}

const label = (row: Row) => row.label;

function printed(rows: Row[]): Row[] {
	return chunkPrintColumns(rows, label).flatMap((chunk) => chunk.columns.map((column) => column.item));
}

describe('chunkPrintColumns', () => {
	it('prints every short group once, in order', () => {
		const rows: Row[] = [
			{ label: '1st Platoon', percent: 92 },
			{ label: 'Headquarters', percent: 71 },
			{ label: 'Dental', percent: null }
		];

		printed(rows).forEach((row, index) => expect(row).toBe(rows[index]));
		expect(printed(rows)).toHaveLength(rows.length);
	});

	it('prints every duty role of a wide roster once, in order, including roles with no applicable requirements', () => {
		const rows: Row[] = Array.from({ length: 22 }, (_, index) => ({
			label: `Patient Administration Specialist ${index + 1}`,
			percent: index % 5 === 0 ? null : 80
		}));

		const chunks = chunkPrintColumns(rows, label);

		expect(printed(rows)).toEqual(rows);
		for (const chunk of chunks) {
			expect(chunk.start).toBe(rows.indexOf(chunk.columns[0].item));
		}
	});

	it('still prints a group whose single word is wider than a sheet', () => {
		const rows: Row[] = [
			{ label: 'Alpha', percent: 50 },
			{ label: 'X'.repeat(400), percent: null },
			{ label: 'Bravo', percent: 100 }
		];

		expect(printed(rows)).toEqual(rows);
	});

	it('prints no matrix sheets for an empty roster', () => {
		expect(chunkPrintColumns([], label)).toEqual([]);
	});
});
