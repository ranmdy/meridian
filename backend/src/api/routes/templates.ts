import type { FastifyInstance } from 'fastify';
import { listTemplates, getTemplate, getTemplateCategories } from '../../services/templates/index.js';

export async function templateRoutes(fastify: FastifyInstance) {
  // GET /templates — browse strategy templates
  fastify.get<{
    Querystring: {
      category?: string;
      maxRisk?: string;
      minApy?: string;
      sort?: string;
      limit?: string;
      offset?: string;
    };
  }>('/templates', async (request, reply) => {
    const { category, maxRisk, minApy, sort, limit, offset } = request.query;
    const result = listTemplates({
      category,
      maxRisk: maxRisk !== undefined ? Number(maxRisk) : undefined,
      minApy: minApy !== undefined ? Number(minApy) : undefined,
      sort: sort as 'popular' | 'apy' | 'risk' | undefined,
      limit: limit !== undefined ? Math.min(Number(limit), 50) : 20,
      offset: offset !== undefined ? Number(offset) : 0,
    });
    return reply.send(result);
  });

  // GET /templates/categories — available category filters
  fastify.get('/templates/categories', async (_request, reply) => {
    return reply.send({ categories: getTemplateCategories() });
  });

  // GET /templates/:id — single template detail
  fastify.get<{ Params: { id: string } }>('/templates/:id', async (request, reply) => {
    const template = getTemplate(request.params.id);
    if (!template) {
      return reply.status(404).send({ error: 'Template not found' });
    }
    return reply.send(template);
  });
}
