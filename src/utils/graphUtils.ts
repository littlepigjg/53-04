import type {
  KnowledgeGraph,
  EntityStats,
  EntityType,
  RelationType,
  SentimentType,
} from '../types';

export function computeStatsLocally(graph: KnowledgeGraph): EntityStats {
  const byType: Record<EntityType, number> = {
    person: 0,
    location: 0,
    organization: 0,
    term: 0,
  };
  for (const e of graph.entities) byType[e.type]++;

  const byRelationType: Record<RelationType, number> = {
    citation: 0,
    dependency: 0,
    comparison: 0,
    cooccurrence: 0,
  };
  for (const r of graph.relations) byRelationType[r.type]++;

  const entityRelationCount = new Map<string, number>();
  for (const r of graph.relations) {
    entityRelationCount.set(
      r.sourceId,
      (entityRelationCount.get(r.sourceId) || 0) + 1
    );
    entityRelationCount.set(
      r.targetId,
      (entityRelationCount.get(r.targetId) || 0) + 1
    );
  }

  const topEntities = graph.entities
    .map((entity) => ({
      entity,
      relationCount: entityRelationCount.get(entity.id) || 0,
    }))
    .sort((a, b) => b.relationCount - a.relationCount)
    .slice(0, 20);

  const sentimentDistribution: Record<SentimentType, number> = {
    positive: 0,
    neutral: 0,
    negative: 0,
  };
  for (const e of graph.entities) sentimentDistribution[e.sentiment]++;

  return {
    totalEntities: graph.entities.length,
    totalRelations: graph.relations.length,
    byType,
    byRelationType,
    topEntities,
    sentimentDistribution,
  };
}

export function getNeighborEntityIds(
  graph: KnowledgeGraph | null,
  entityId: string,
  depth: number = 1
): Set<string> {
  if (!graph) return new Set();
  const visited = new Set<string>();
  const queue: Array<{ id: string; d: number }> = [{ id: entityId, d: 0 }];
  visited.add(entityId);
  while (queue.length > 0) {
    const { id, d } = queue.shift()!;
    if (d >= depth) continue;
    for (const r of graph.relations) {
      const next = r.sourceId === id ? r.targetId : r.targetId === id ? r.sourceId : null;
      if (next && !visited.has(next)) {
        visited.add(next);
        queue.push({ id: next, d: d + 1 });
      }
    }
  }
  return visited;
}

export function computeGraphBoundingBox(
  nodes: Array<{ x?: number; y?: number }>
): { minX: number; maxX: number; minY: number; maxY: number } {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const n of nodes) {
    if (n.x === undefined || n.y === undefined) continue;
    minX = Math.min(minX, n.x);
    maxX = Math.max(maxX, n.x);
    minY = Math.min(minY, n.y);
    maxY = Math.max(maxY, n.y);
  }
  if (!isFinite(minX)) {
    return { minX: 0, maxX: 0, minY: 0, maxY: 0 };
  }
  return { minX, maxX, minY, maxY };
}

export function getNodeRadius(frequency: number): number {
  return Math.max(6, Math.min(20, 4 + Math.sqrt(frequency) * 3));
}
