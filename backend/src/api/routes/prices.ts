import type { FastifyInstance } from 'fastify';
import { priceFeed } from '../../services/price-feed/index.js';

export async function priceRoutes(fastify: FastifyInstance) {
  // GET /prices — all cached token prices
  fastify.get('/prices', async (_request, reply) => {
    return reply.send({ prices: priceFeed.getAllPrices() });
  });

  // GET /prices/:symbol — single token price
  fastify.get('/prices/:symbol', async (request, reply) => {
    const { symbol } = request.params as { symbol: string };
    const price = priceFeed.getPrice(symbol.toUpperCase());
    if (!price) {
      return reply.status(404).send({ error: `No price data for ${symbol.toUpperCase()}` });
    }
    return reply.send(price);
  });
}
