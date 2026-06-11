import { create } from 'zustand';
import type { KnowledgeGraph, EntityStats, EntityType, RelationType, SentimentType } from '../types';
import { knowledgeGraphApi } from '../utils/api';

function computeStatsLocally(graph: KnowledgeGraph): EntityStats {
  const byType: Record<EntityType, number> = { person: 0, location: 0, organization: 0, term: 0 };
  for (const e of graph.entities) byType[e.type]++;

  const byRelationType: Record<RelationType, number> = { citation: 0, dependency: 0, comparison: 0, cooccurrence: 0 };
  for (const r of graph.relations) byRelationType[r.type]++;

  const entityRelationCount = new Map<string, number>();
  for (const r of graph.relations) {
    entityRelationCount.set(r.sourceId, (entityRelationCount.get(r.sourceId) || 0) + 1);
    entityRelationCount.set(r.targetId, (entityRelationCount.get(r.targetId) || 0) + 1);
  }

  const topEntities = graph.entities
    .map((entity) => ({ entity, relationCount: entityRelationCount.get(entity.id) || 0 }))
    .sort((a, b) => b.relationCount - a.relationCount)
    .slice(0, 20);

  const sentimentDistribution: Record<SentimentType, number> = { positive: 0, neutral: 0, negative: 0 };
  for (const e of graph.entities) sentimentDistribution[e.sentiment]++;

  return { totalEntities: graph.entities.length, totalRelations: graph.relations.length, byType, byRelationType, topEntities, sentimentDistribution };
}

interface KnowledgeGraphState {
  graph: KnowledgeGraph | null;
  stats: EntityStats | null;
  selectedEntityId: string | null;
  hoveredEntityId: string | null;
  expandedEntityIds: Set<string>;
  highlightParagraphIds: string[];
  entityTypeFilter: EntityType[];
  searchQuery: string;
  loading: boolean;
  error: string | null;

  loadForDocument: (docId: string) => Promise<void>;
  loadForAll: () => Promise<void>;
  selectEntity: (entityId: string | null) => void;
  hoverEntity: (entityId: string | null) => void;
  expandEntity: (entityId: string) => Promise<void>;
  setEntityTypeFilter: (types: EntityType[]) => void;
  setSearchQuery: (query: string) => void;
  reset: () => void;
}

export const useKnowledgeGraphStore = create<KnowledgeGraphState>((set, get) => ({
  graph: null,
  stats: null,
  selectedEntityId: null,
  hoveredEntityId: null,
  expandedEntityIds: new Set<string>(),
  highlightParagraphIds: [],
  entityTypeFilter: ['person', 'location', 'organization', 'term'],
  searchQuery: '',
  loading: false,
  error: null,

  loadForDocument: async (docId: string) => {
    try {
      set({ loading: true, error: null });
      const [graph, stats] = await Promise.all([
        knowledgeGraphApi.forDocument(docId),
        knowledgeGraphApi.statsForDocument(docId),
      ]);
      set({ graph, stats, loading: false });
    } catch (e) {
      set({ error: (e as Error).message, loading: false });
    }
  },

  loadForAll: async () => {
    try {
      set({ loading: true, error: null });
      const [graph, stats] = await Promise.all([
        knowledgeGraphApi.forAll(),
        knowledgeGraphApi.statsForAll(),
      ]);
      set({ graph, stats, loading: false });
    } catch (e) {
      set({ error: (e as Error).message, loading: false });
    }
  },

  selectEntity: (entityId: string | null) => {
    const { graph } = get();
    if (!entityId || !graph) {
      set({ selectedEntityId: null, highlightParagraphIds: [] });
      return;
    }
    const entity = graph.entities.find((e) => e.id === entityId);
    if (entity) {
      set({
        selectedEntityId: entityId,
        highlightParagraphIds: entity.paragraphIds,
      });
    }
  },

  hoverEntity: (entityId: string | null) => {
    set({ hoveredEntityId: entityId });
  },

  expandEntity: async (entityId: string) => {
    const { graph, expandedEntityIds } = get();
    if (!graph || expandedEntityIds.has(entityId)) return;

    try {
      const expanded = await knowledgeGraphApi.expand(entityId, 1);
      const existingEntityIds = new Set(graph.entities.map((e) => e.id));
      const existingRelationIds = new Set(graph.relations.map((r) => r.id));

      const newEntities = expanded.entities.filter(
        (e) => !existingEntityIds.has(e.id)
      );
      const newRelations = expanded.relations.filter(
        (r) => !existingRelationIds.has(r.id)
      );

      const newExpanded = new Set(expandedEntityIds);
      newExpanded.add(entityId);

      const newGraph: KnowledgeGraph = {
        entities: [...graph.entities, ...newEntities],
        relations: [...graph.relations, ...newRelations],
      };

      const newStats = computeStatsLocally(newGraph);

      set({
        graph: newGraph,
        stats: newStats,
        expandedEntityIds: newExpanded,
      });
    } catch {
      const newExpanded = new Set(expandedEntityIds);
      newExpanded.add(entityId);
      set({ expandedEntityIds: newExpanded });
    }
  },

  setEntityTypeFilter: (types: EntityType[]) => {
    set({ entityTypeFilter: types });
  },

  setSearchQuery: (query: string) => {
    set({ searchQuery: query });
  },

  reset: () => {
    set({
      graph: null,
      stats: null,
      selectedEntityId: null,
      hoveredEntityId: null,
      expandedEntityIds: new Set(),
      highlightParagraphIds: [],
      entityTypeFilter: ['person', 'location', 'organization', 'term'],
      searchQuery: '',
      loading: false,
      error: null,
    });
  },
}));
