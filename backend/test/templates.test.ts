import { describe, it, expect } from 'vitest';
import {
  listTemplates,
  getTemplate,
  getTemplateCategories,
} from '../src/services/templates/index.js';

describe('TemplateService', () => {
  describe('listTemplates', () => {
    it('returns templates and total count', () => {
      const { templates, total } = listTemplates();
      expect(templates.length).toBeGreaterThan(0);
      expect(total).toBeGreaterThanOrEqual(templates.length);
    });

    it('respects limit parameter', () => {
      const { templates } = listTemplates({ limit: 2 });
      expect(templates.length).toBeLessThanOrEqual(2);
    });

    it('respects offset parameter', () => {
      const all   = listTemplates({ limit: 100 });
      const paged = listTemplates({ offset: 1, limit: 100 });
      // First item of paged should be second of all
      if (all.templates.length >= 2) {
        expect(paged.templates[0].id).toBe(all.templates[1].id);
      }
    });

    it('filters by category', () => {
      const { templates } = listTemplates({ category: 'yield' });
      expect(templates.every((t) => t.category === 'yield')).toBe(true);
    });

    it('filters by maxRisk', () => {
      const { templates } = listTemplates({ maxRisk: 2 });
      expect(templates.every((t) => t.riskLevel <= 2)).toBe(true);
    });

    it('filters by minApy', () => {
      const minApy = 500;
      const { templates } = listTemplates({ minApy });
      expect(templates.every((t) => t.estimatedApyBps >= minApy)).toBe(true);
    });

    it('sorts by apy descending when sort=apy', () => {
      const { templates } = listTemplates({ sort: 'apy', limit: 100 });
      for (let i = 1; i < templates.length; i++) {
        expect(templates[i - 1].estimatedApyBps).toBeGreaterThanOrEqual(
          templates[i].estimatedApyBps,
        );
      }
    });

    it('sorts by risk ascending when sort=risk', () => {
      const { templates } = listTemplates({ sort: 'risk', limit: 100 });
      for (let i = 1; i < templates.length; i++) {
        expect(templates[i - 1].riskLevel).toBeLessThanOrEqual(templates[i].riskLevel);
      }
    });

    it('sorts by popularityScore descending when sort=popular', () => {
      const { templates } = listTemplates({ sort: 'popular', limit: 100 });
      for (let i = 1; i < templates.length; i++) {
        expect(templates[i - 1].popularityScore).toBeGreaterThanOrEqual(
          templates[i].popularityScore,
        );
      }
    });

    it('returns empty array for unknown category', () => {
      const { templates, total } = listTemplates({ category: 'nonexistent' });
      expect(templates).toHaveLength(0);
      expect(total).toBe(0);
    });
  });

  describe('getTemplate', () => {
    it('returns a template by id', () => {
      const all = listTemplates({ limit: 1 });
      if (all.templates.length === 0) return;
      const t = getTemplate(all.templates[0].id);
      expect(t).not.toBeNull();
      expect(t?.id).toBe(all.templates[0].id);
    });

    it('returns null for unknown id', () => {
      expect(getTemplate('does-not-exist')).toBeNull();
    });
  });

  describe('getTemplateCategories', () => {
    it('returns a non-empty array of strings', () => {
      const cats = getTemplateCategories();
      expect(cats.length).toBeGreaterThan(0);
      expect(cats.every((c) => typeof c === 'string')).toBe(true);
    });

    it('contains yield category', () => {
      expect(getTemplateCategories()).toContain('yield');
    });

    it('has no duplicates', () => {
      const cats = getTemplateCategories();
      expect(cats.length).toBe(new Set(cats).size);
    });
  });
});
