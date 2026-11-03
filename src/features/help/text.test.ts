import { describe, expect, it } from 'vitest';
import { highlightSegments, markupSegments } from './text';

describe('markupSegments', () => {
	it('bolds the text between paired asterisks', () => {
		expect(markupSegments('Open **Calendar settings** and choose **Assignment types**.')).toEqual([
			{ text: 'Open ', bold: false },
			{ text: 'Calendar settings', bold: true },
			{ text: ' and choose ', bold: false },
			{ text: 'Assignment types', bold: true },
			{ text: '.', bold: false }
		]);
	});

	it('leaves an unpaired marker as plain text', () => {
		expect(markupSegments('Use **New')).toEqual([{ text: 'Use **New', bold: false }]);
	});

	it('returns a markup-free line whole', () => {
		expect(markupSegments('Select Save.')).toEqual([{ text: 'Select Save.', bold: false }]);
	});
});

describe('highlightSegments', () => {
	it('bolds each query word wherever it occurs, ignoring case', () => {
		expect(highlightSegments('Print the DA 6', 'da print')).toEqual([
			{ text: 'Print', bold: true },
			{ text: ' the ', bold: false },
			{ text: 'DA', bold: true },
			{ text: ' 6', bold: false }
		]);
	});

	it('treats regex characters in the query as literal text', () => {
		expect(highlightSegments('Add a (rank) range', '(rank')).toEqual([
			{ text: 'Add a ', bold: false },
			{ text: '(rank', bold: true },
			{ text: ') range', bold: false }
		]);
	});

	it('returns the text whole for an empty query', () => {
		expect(highlightSegments('Print the DA 6', '  ')).toEqual([{ text: 'Print the DA 6', bold: false }]);
	});
});
