import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import { createTestContext } from '$lib/server/adapters/inMemory';
import { handleUseCaseRequest, type RouteConfig } from '$lib/server/adapters/httpAdapter';
import { WORKBOOK_MIME_TYPE } from '$lib/utils/workbook';
import type { TrainingBriefingDetail, TrainingBriefingReportData } from '$features/training/contracts';
import { _getConfig } from './+server';
import { _getDetailConfig } from './detail/+server';
import { _getConfig as _getExportConfig } from './export/+server';

type WorkbookLoadBuffer = Parameters<ExcelJS.Workbook['xlsx']['load']>[0];

const NO_TRAINING = {
	calendar: 'none',
	personnel: 'none',
	training: 'none',
	criticalTasks: 'none',
	onboarding: 'none',
	ratingScheme: 'none'
} as const;

function seededContext(overrides: Parameters<typeof createTestContext>[0] = {}) {
	const ctx = createTestContext(overrides);
	const org = ctx.auth.orgId;
	ctx.store.seed('organizations', [{ id: org, name: 'Test Company', training_readiness_goal_percent: 90 }]);
	ctx.store.seed('groups', [{ id: 'alpha', organization_id: org, name: 'Alpha', sort_order: 0 }]);
	ctx.store.seed(
		'personnel',
		['Able', 'Baker', 'Cole'].map((lastName) => ({
			id: `p-${lastName.toLowerCase()}`,
			organization_id: org,
			rank: 'SGT',
			last_name: lastName,
			first_name: 'Pat',
			mos: lastName === 'Baker' ? '11B' : '68W',
			clinic_role: 'Medic',
			group_id: 'alpha',
			archived_at: null,
			groups: { name: 'Alpha' }
		}))
	);
	ctx.store.seed('training_types', [
		{
			id: 'cpr',
			organization_id: org,
			name: 'CPR',
			description: null,
			expiration_months: 12,
			warning_days_yellow: 60,
			warning_days_orange: 30,
			applies_to_roles: [],
			applies_to_mos: [],
			applies_to_ranks: [],
			excluded_roles: [],
			excluded_mos: [],
			excluded_ranks: [],
			color: '#22c55e',
			sort_order: 0,
			expiration_date_only: false,
			can_be_exempted: false,
			exempt_personnel_ids: [],
			is_optional: false
		}
	]);
	return ctx;
}

function request<TInput, TOutput>(
	config: RouteConfig<TInput, TOutput, Parameters<typeof _getConfig.fn>[0]>,
	query: string,
	ctx = seededContext()
): Promise<TOutput> {
	const url = new URL(`https://example.test/org/test-org/api/training-reports?${query}`);
	return handleUseCaseRequest(config, ctx, config.parseInput!({ url } as never), () => ctx);
}

describe('GET /api/training-reports', () => {
	it('returns the briefing for the filters in the URL with canonical input', async () => {
		const report = await request(_getConfig, 'mos=68W&mos=ZZZ&horizon=60&rowsBy=mos&group=ghost');

		expect(report.input).toEqual({
			viewId: null,
			groupId: null,
			rank: null,
			mos: ['68W'],
			roles: [],
			typeIds: [],
			horizonDays: 60,
			rowsBy: 'mos'
		});
		expect(report.briefing.bottomLine).toMatchObject({ scopeName: 'Test Company', soldierCount: 2 });
		expect(report.briefing.grid.rows.map((row) => row.label)).toEqual(['68W']);
	});

	it('marks briefing responses private and non-cacheable', () => {
		const response = _getConfig.formatOutput!({} as TrainingBriefingReportData);

		expect(response.headers.get('Cache-Control')).toBe('private, no-store');
		expect(response.headers.get('Vary')).toBe('Cookie');
	});
});

describe('GET /api/training-reports/detail', () => {
	it('pages a cell of affected requirements and clamps an oversized page size to 100', async () => {
		const detail = await request(_getDetailConfig, 'scope=cell&type=cpr&pageSize=500&page=3');

		expect(detail.pageSize).toBe(100);
		expect(detail.page).toBe(1);
		expect(detail.rows.map((row) => row.name)).toEqual(['Able, Pat', 'Baker, Pat', 'Cole, Pat']);
	});

	it.each([
		['no scope', 'type=cpr'],
		['an unknown scope kind', 'scope=row&type=cpr'],
		['a cell without a type', 'scope=cell&row=alpha'],
		['a focus area without a key', 'scope=focus']
	])('rejects %s as a bad request', async (_case, query) => {
		await expect(request(_getDetailConfig, query)).rejects.toMatchObject({ status: 400 });
	});

	it('returns not found for a row the filters do not produce', async () => {
		await expect(request(_getDetailConfig, 'scope=cell&row=bravo&type=cpr')).rejects.toMatchObject({ status: 404 });
	});

	it('marks detail responses private and non-cacheable', () => {
		const response = _getDetailConfig.formatOutput!({} as TrainingBriefingDetail);

		expect(response.headers.get('Cache-Control')).toBe('private, no-store');
		expect(response.headers.get('Vary')).toBe('Cookie');
	});
});

describe('GET /api/training-reports/export', () => {
	it('downloads the workbook for the filtered population', async () => {
		const result = await request(_getExportConfig, 'mos=11B');
		const response = _getExportConfig.formatOutput!(result);
		const workbook = new ExcelJS.Workbook();
		await workbook.xlsx.load(result.buffer as WorkbookLoadBuffer);

		expect(workbook.getWorksheet('Requirements')!.getSheetValues().slice(1)).toEqual([
			[
				undefined,
				'Rank',
				'Name',
				'Group',
				'Training type',
				'Status today',
				'Expiration date',
				'Lapse date',
				'Lapses in horizon'
			],
			[undefined, 'SGT', 'Baker, Pat', 'Alpha', 'CPR', 'Not Done', undefined, undefined, 'No']
		]);
		expect(workbook.getWorksheet('Summary')!.getRow(20).values).toEqual([undefined, 'Filter: MOS', '11B']);
		expect(response.headers.get('Content-Type')).toBe(WORKBOOK_MIME_TYPE);
		expect(response.headers.get('Content-Disposition')).toMatch(/attachment; filename="training-report-.*\.xlsx"/);
		expect(response.headers.get('Cache-Control')).toBe('private, no-store');
	});
});

describe('Training report API access', () => {
	it.each([
		['summary', _getConfig, ''],
		['detail', _getDetailConfig, 'scope=cell&type=cpr'],
		['export', _getExportConfig, '']
	] as const)(
		'denies the %s route without Training view and records the policy denial',
		async (_name, config, query) => {
			const ctx = seededContext({
				auth: { role: 'member', isPrivileged: false, capabilityMap: NO_TRAINING, scopeSet: { kind: 'organization' } }
			});

			await expect(request(config as RouteConfig<unknown, unknown>, query, ctx)).rejects.toMatchObject({
				status: 403
			});
			expect(ctx.auditPort.events).toEqual([
				expect.objectContaining({ action: 'policy.denied', resourceType: 'training.viewRecords' })
			]);
		}
	);
});
