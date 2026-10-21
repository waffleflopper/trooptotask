import type { RequestPersonnelArchiveApproval } from '$features/personnel';
import { submitDeletionRequest } from '$features/deletion-requests';

export const requestPersonnelArchiveApproval: RequestPersonnelArchiveApproval = (request) =>
	submitDeletionRequest(request.orgId, 'personnel', request.personnelId, request.description, request.resourceUrl);
