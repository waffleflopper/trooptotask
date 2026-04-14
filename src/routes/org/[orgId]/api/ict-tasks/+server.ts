import { IctTaskEntity } from '$lib/server/entities/ictTask';
import { entityHandlers } from '$lib/server/adapters/httpAdapter';

export const { POST, PUT } = entityHandlers(IctTaskEntity);
