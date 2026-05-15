import type { ServerLoadEvent } from '@sveltejs/kit';
import type {
	PersonnelDetailHeader,
	PersonnelDetailSubpageData,
	PersonnelDetailSubpageKey
} from '$features/personnel/personnel-detail.types';

interface PersonnelDetailParentData {
	personnelDetailHeader: PersonnelDetailHeader;
}

interface PersonnelDetailSubpageConfig {
	section: PersonnelDetailSubpageKey;
	title: string;
	emptyState: string;
}

export function createPersonnelDetailSubpageLoad(config: PersonnelDetailSubpageConfig) {
	return async ({ parent, depends }: ServerLoadEvent): Promise<PersonnelDetailSubpageData> => {
		depends(`app:personnel-detail-${config.section}`);
		const parentData = (await parent()) as PersonnelDetailParentData;

		return {
			personnelId: parentData.personnelDetailHeader.person.id,
			section: config.section,
			title: config.title,
			emptyState: config.emptyState,
			records: []
		};
	};
}
