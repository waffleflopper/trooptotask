import type { QueryWithRawStorePorts, UseCaseContext } from '$lib/server/core/ports';
import { readOrganizationPlanUsage } from '$lib/server/core/useCases/organizationPlanUsage';
import { readEffectivePlanPolicy } from '$lib/server/core/useCases/planPolicy';
import type { SettingsExportInfo, SettingsExportsSectionData } from './settingsSectionTypes';

export interface ExportsSettingsData {
	sections: {
		exports: SettingsExportsSectionData;
	};
}

export type SettingsExportInfoSource = Pick<SettingsExportInfo, 'exportsUsed' | 'exportsLimit' | 'isLimited'>;

export interface BuildExportsSettingsDataInput {
	exportInfo: SettingsExportInfoSource;
}

export async function loadExportsSettings(ctx: QueryWithRawStorePorts): Promise<ExportsSettingsData> {
	const exportInfo = await loadExportInfo(ctx);

	return buildExportsSettingsData({
		exportInfo
	});
}

export function buildExportsSettingsData(input: BuildExportsSettingsDataInput): ExportsSettingsData {
	const exportInfo = shapeExportInfo(input.exportInfo);

	return {
		sections: {
			exports: {
				exportInfo,
				commands: {
					canExportJson: !exportInfo.limitReached,
					canExportExcel: !exportInfo.limitReached
				}
			}
		}
	};
}

async function loadExportInfo(ctx: Pick<UseCaseContext, 'auth' | 'rawStore'>): Promise<SettingsExportInfoSource> {
	const [policy, usage] = await Promise.all([
		readEffectivePlanPolicy({ auth: ctx.auth, store: ctx.rawStore }),
		readOrganizationPlanUsage({ auth: ctx.auth, store: ctx.rawStore })
	]);
	const exportLimit = policy.exportQuota.limit;
	return {
		exportsUsed: usage.monthlyExportCount,
		exportsLimit: exportLimit ?? Infinity,
		isLimited: exportLimit !== null
	};
}

function shapeExportInfo(source: SettingsExportInfoSource): SettingsExportInfo {
	const limitReached = source.isLimited && source.exportsUsed >= source.exportsLimit;
	return {
		...source,
		limitReached,
		planBadge: source.isLimited ? 'Plan limited' : 'Unlimited exports'
	};
}
