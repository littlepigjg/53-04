import { create } from 'zustand';
import type { KnowledgeGraph, EntityStats, EntityType } from '../types';
import { knowledgeGraphApi } from '../utils/api';
import { computeStatsLocally } from '../utils/graphUtils';

interface KnowledgeGraphState {
  graph: KnowledgeGraph | null;
  stats: EntityStats | null;
  selectedEntityId: string | null;
  hoveredEntityId: string | null;
  expandedEntityIds: Set<string>;
  pinnedEntityIds: Set<string>;
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
  addPinnedEntities: (ids: string[]) => void;
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
  pinnedEntityIds: new Set<string>(),
  highlightParagraphIds: [],
  entityTypeFilter: ['person', 'location', 'organization', 'term'],
  searchQuery: '',
  loading: false,
  error: null,

  loadForDocument: async (docId: string) => {
    try {
      set({ loading: true, error: null, pinnedEntityIds: new Set() });
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
      set({ loading: true, error: null, pinnedEntityIds: new Set() });
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
      const neighborIds = new Set<string>([entityId]);
      for (const r of graph.relations) {
        if (r.sourceId === entityId) neighborIds.add(r.targetId);
        else if (r.targetId === entityId) neighborIds.add(r.sourceId);
      }
      set((s) => {
        const merged = new Set(s.pinnedEntityIds);
        neighborIds.forEach((id) => merged.add(id));
        return {
          selectedEntityId: entityId,
          highlightParagraphIds: entity.paragraphIds,
          pinnedEntityIds: merged,
        };
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

      const newEntities = expanded.entities.filter((e) => !existingEntityIds.has(e.id));
      const newRelations = expanded.relations.filter((r) => !existingRelationIds.has(r.id));

      const newExpanded = new Set(expandedEntityIds);
      newExpanded.add(entityId);

      const newGraph: KnowledgeGraph = {
        entities: [...graph.entities, ...newEntities],
        relations: [...graph.relations, ...newRelations],
      };

      const newStats = computeStatsLocally(newGraph);

      const forceIds = new Set<string>([entityId]);
      newEntities.forEach((e) => forceIds.add(e.id));
      expanded.relations.forEach((r) => {
        forceIds.add(r.sourceId);
        forceIds.add(r.targetId);
      });

      set((s) => {
        const mergedPinned = new Set(s.pinnedEntityIds);
        forceIds.forEach((id) => mergedPinned.add(id));
        return {
          graph: newGraph,
          stats: newStats,
          expandedEntityIds: newExpanded,
          pinnedEntityIds: mergedPinned,
        };
      });
    } catch {
      const newExpanded = new Set(expandedEntityIds);
      newExpanded.add(entityId);
      set({ expandedEntityIds: newExpanded });
    }
  },

  addPinnedEntities: (ids: string[]) => {
    if (ids.length === 0) return;
    set((s) => {
      const merged = new Set(s.pinnedEntityIds);
      ids.forEach((id) => merged.add(id));
      if (merged.size === s.pinnedEntityIds.size) return s;
      return { pinnedEntityIds: merged };
    });
  },

  setEntityTypeFilter: (types: EntityType[]) => {
    set({ entityTypeFilter: types });
  },

  setSearchQuery: (query: string) => {
    set({ searchQuery: query });
    if (!query.trim()) return;
    const { graph } = get();
    if (!graph) return;
    const q = query.toLowerCase();
    const matches = graph.entities.filter((e) => e.name.toLowerCase().includes(q));
    if (matches.length > 0) {
      set((s) => {
        const merged = new Set(s.pinnedEntityIds);
        matches.forEach((e) => merged.add(e.id));
        return { pinnedEntityIds: merged };
      });
    }
  },

  reset: () => {
    set({
      graph: null,
      stats: null,
      selectedEntityId: null,
      hoveredEntityId: null,
      expandedEntityIds: new Set(),
      pinnedEntityIds: new Set(),
      highlightParagraphIds: [],
      entityTypeFilter: ['person', 'location', 'organization', 'term'],
      searchQuery: '',
      loading: false,
      error: null,
    });
  },
}));
