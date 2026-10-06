import { describe, expect, it } from 'vitest';
import {
	DEFAULT_TRAINING_BRIEFING_INPUT,
	parseTrainingBriefingReportInput,
	serializeTrainingBriefingDetailInput,
	serializeTrainingBriefingReportInput
} from './briefingReportInput';

const parse = (query: string) => parseTrainingBriefingReportInput(new URLSearchParams(query));

describe('Training briefing URL input', () => {
	it('reads every filter, the horizon and the row grouping from search params', () => {
		expect(
			parse('view=v1&group=g1&rank=SGT&mos=68W&mos=11B&role=Medic&types=t2&types=t1&horizon=180&rowsBy=role')
		).toEqual({
			viewId: 'v1',
			groupId: 'g1',
			rank: 'SGT',
			mos: ['68W', '11B'],
			roles: ['Medic'],
			typeIds: ['t2', 't1'],
			horizonDays: 180,
			rowsBy: 'role'
		});
	});

	it('defaults each missing or invalid value on its own and drops blank and repeated entries', () => {
		expect(parse('')).toEqual(DEFAULT_TRAINING_BRIEFING_INPUT);
		expect(parse('horizon=45&rowsBy=soldier&group=&mos=68W&mos=&mos=68W&rank=SPC')).toEqual({
			...DEFAULT_TRAINING_BRIEFING_INPUT,
			rank: 'SPC',
			mos: ['68W']
		});
		expect(parse('horizon=30.0&rowsBy=mos').horizonDays).toBe(30);
		expect(parse('horizon=abc').horizonDays).toBe(90);
	});

	it('serializes defaults to an empty query and round-trips a filtered briefing', () => {
		expect(serializeTrainingBriefingReportInput(DEFAULT_TRAINING_BRIEFING_INPUT).toString()).toBe('');

		const query = 'view=v1&group=g1&mos=68W&mos=11B&role=Line&types=t1&horizon=30&rowsBy=mos';
		const params = serializeTrainingBriefingReportInput(parse(query));

		expect(params.toString()).toBe(query);
		expect(parse(params.toString())).toEqual(parse(query));
	});

	it('names a Total cell without a row and keeps an empty row key for a blank MOS row', () => {
		const report = { ...DEFAULT_TRAINING_BRIEFING_INPUT, horizonDays: 60 as const };

		expect(
			serializeTrainingBriefingDetailInput({
				report,
				scope: { kind: 'cell', rowKey: null, typeId: 'cpr' },
				page: 1,
				pageSize: 25
			}).toString()
		).toBe('horizon=60&scope=cell&type=cpr');
		expect(
			serializeTrainingBriefingDetailInput({
				report,
				scope: { kind: 'cell', rowKey: '', typeId: 'cpr' },
				page: 2,
				pageSize: 100
			}).toString()
		).toBe('horizon=60&scope=cell&row=&type=cpr&page=2&pageSize=100');
		expect(
			serializeTrainingBriefingDetailInput({
				report,
				scope: { kind: 'focus', key: 'row:group:alpha' },
				page: 1,
				pageSize: 25
			}).toString()
		).toBe('horizon=60&scope=focus&focus=row%3Agroup%3Aalpha');
	});
});
