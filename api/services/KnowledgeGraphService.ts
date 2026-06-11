import type { Entity, Relation, KnowledgeGraph, EntityStats, EntityType, RelationType, SentimentType } from '../../shared/types.js';
import { NERService } from './NERService.js';
import { RelationExtractionService } from './RelationExtractionService.js';
import { DocumentParser } from './DocumentParser.js';
import { FileStorageService } from './FileStorageService.js';
import type { DocumentMeta } from '../../shared/types.js';

const graphCache = new Map<string, { graph: KnowledgeGraph; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000;

export class KnowledgeGraphService {
  static clearCache(): void {
    graphCache.clear();
  }

  static async buildForDocument(docId: string): Promise<KnowledgeGraph> {
    const cacheKey = `doc:${docId}`;
    const cached = graphCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return cached.graph;
    }

    const parsed = await DocumentParser.getParsed(docId);
    const entities = NERService.extractFromParagraphs(parsed.paragraphs, docId);
    const relations = RelationExtractionService.extractRelations(entities, parsed.paragraphs, docId);
    const graph: KnowledgeGraph = { entities, relations };

    graphCache.set(cacheKey, { graph, timestamp: Date.now() });
    return graph;
  }

  static async buildForAllDocuments(): Promise<KnowledgeGraph> {
    const cacheKey = 'all';
    const cached = graphCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return cached.graph;
    }

    const docs = await FileStorageService.readJson<DocumentMeta[]>(
      FileStorageService.getDocumentsPath(),
      []
    );

    const allEntities: Entity[][] = [];
    const allRelations: Relation[] = [];

    for (const doc of docs) {
      try {
        const parsed = await DocumentParser.getParsed(doc.id);
        const entities = NERService.extractFromParagraphs(parsed.paragraphs, doc.id);
        allEntities.push(entities);
      } catch {
        continue;
      }
    }

    const mergedEntities = NERService.mergeEntities(allEntities);

    const allParagraphs: Array<{ paragraphs: import('../../shared/types.js').Paragraph[]; docId: string }> = [];
    for (const doc of docs) {
      try {
        const parsed = await DocumentParser.getParsed(doc.id);
        allParagraphs.push({ paragraphs: parsed.paragraphs, docId: doc.id });
      } catch {
        continue;
      }
    }

    for (const { paragraphs, docId } of allParagraphs) {
      const docEntities = mergedEntities.filter((e) =>
        e.docIds.includes(docId)
      );
      const relations = RelationExtractionService.extractRelations(
        docEntities,
        paragraphs,
        docId
      );
      allRelations.push(...relations);
    }

    const dedupedRelations = KnowledgeGraphService.deduplicateRelations(allRelations);

    const graph: KnowledgeGraph = { entities: mergedEntities, relations: dedupedRelations };
    graphCache.set(cacheKey, { graph, timestamp: Date.now() });

    return graph;
  }

  static computeStats(graph: KnowledgeGraph): EntityStats {
    const byType: Record<EntityType, number> = { person: 0, location: 0, organization: 0, term: 0 };
    for (const e of graph.entities) {
      byType[e.type]++;
    }

    const byRelationType: Record<RelationType, number> = { citation: 0, dependency: 0, comparison: 0, cooccurrence: 0 };
    for (const r of graph.relations) {
      byRelationType[r.type]++;
    }

    const entityRelationCount = new Map<string, number>();
    for (const r of graph.relations) {
      entityRelationCount.set(r.sourceId, (entityRelationCount.get(r.sourceId) || 0) + 1);
      entityRelationCount.set(r.targetId, (entityRelationCount.get(r.targetId) || 0) + 1);
    }

    const topEntities = graph.entities
      .map((entity) => ({
        entity,
        relationCount: entityRelationCount.get(entity.id) || 0,
      }))
      .sort((a, b) => b.relationCount - a.relationCount)
      .slice(0, 20);

    const sentimentDistribution: Record<SentimentType, number> = { positive: 0, neutral: 0, negative: 0 };
    for (const e of graph.entities) {
      sentimentDistribution[e.sentiment]++;
    }

    return {
      totalEntities: graph.entities.length,
      totalRelations: graph.relations.length,
      byType,
      byRelationType,
      topEntities,
      sentimentDistribution,
    };
  }

  static async getRelatedEntities(
    entityId: string,
    graph: KnowledgeGraph,
    depth: number = 1
  ): Promise<{ entities: Entity[]; relations: Relation[] }> {
    const entityMap = new Map(graph.entities.map((e) => [e.id, e]));
    const visited = new Set<string>();
    const resultEntities: Entity[] = [];
    const resultRelations: Relation[] = [];

    const queue: Array<{ id: string; d: number }> = [{ id: entityId, d: 0 }];
    visited.add(entityId);

    while (queue.length > 0) {
      const { id, d } = queue.shift()!;
      const entity = entityMap.get(id);
      if (entity) resultEntities.push(entity);

      if (d >= depth) continue;

      for (const rel of graph.relations) {
        let neighborId: string | null = null;
        if (rel.sourceId === id) neighborId = rel.targetId;
        else if (rel.targetId === id) neighborId = rel.sourceId;

        if (neighborId && !visited.has(neighborId)) {
          visited.add(neighborId);
          resultRelations.push(rel);
          queue.push({ id: neighborId, d: d + 1 });
        } else if (neighborId && visited.has(neighborId)) {
          if (!resultRelations.find((r) => r.id === rel.id)) {
            resultRelations.push(rel);
          }
        }
      }
    }

    return { entities: resultEntities, relations: resultRelations };
  }

  private static deduplicateRelations(relations: Relation[]): Relation[] {
    const seen = new Set<string>();
    const result: Relation[] = [];
    for (const r of relations) {
      const key = [r.sourceId, r.targetId].sort().join('||') + r.type;
      if (!seen.has(key)) {
        seen.add(key);
        result.push(r);
      }
    }
    return result;
  }
}
