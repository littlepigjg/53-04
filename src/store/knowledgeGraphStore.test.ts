import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useKnowledgeGraphStore } from './knowledgeGraphStore';
import type { KnowledgeGraph, Entity } from '../types';

vi.mock('../utils/api', () => ({
  knowledgeGraphApi: {
    forDocument: vi.fn(),
    forAll: vi.fn(),
    statsForDocument: vi.fn(),
    statsForAll: vi.fn(),
    expand: vi.fn(),
  },
}));

import { knowledgeGraphApi } from '../utils/api';

const createMockEntity = (
  id: string,
  name: string,
  type: Entity['type'] = 'term',
  frequency: number = 1
): Entity => ({
  id,
  name,
  type,
  frequency,
  docIds: ['doc1'],
  paragraphIds: ['p1'],
  summary: `${name} 的摘要`,
  sentiment: 'neutral',
  sentimentScore: 0,
});

const mockGraph: KnowledgeGraph = {
  entities: [
    createMockEntity('e1', '实体一', 'person', 10),
    createMockEntity('e2', '实体二', 'term', 5),
    createMockEntity('e3', '实体三', 'location', 3),
  ],
  relations: [
    { id: 'r1', sourceId: 'e1', targetId: 'e2', type: 'citation', weight: 2, evidence: [] },
    { id: 'r2', sourceId: 'e2', targetId: 'e3', type: 'cooccurrence', weight: 1, evidence: [] },
  ],
};

const mockStats = {
  totalEntities: 3,
  totalRelations: 2,
  byType: { person: 1, location: 1, organization: 0, term: 1 },
  byRelationType: { citation: 1, dependency: 0, comparison: 0, cooccurrence: 1 },
  topEntities: [],
  sentimentDistribution: { positive: 0, neutral: 3, negative: 0 },
};

describe('knowledgeGraphStore', () => {
  beforeEach(() => {
    useKnowledgeGraphStore.setState({
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
    vi.clearAllMocks();
  });

  describe('初始状态', () => {
    it('初始状态正确', () => {
      const state = useKnowledgeGraphStore.getState();
      expect(state.graph).toBeNull();
      expect(state.stats).toBeNull();
      expect(state.selectedEntityId).toBeNull();
      expect(state.pinnedEntityIds.size).toBe(0);
      expect(state.entityTypeFilter).toEqual(['person', 'location', 'organization', 'term']);
      expect(state.searchQuery).toBe('');
      expect(state.loading).toBe(false);
      expect(state.error).toBeNull();
    });
  });

  describe('selectEntity', () => {
    beforeEach(() => {
      useKnowledgeGraphStore.setState({ graph: mockGraph });
    });

    it('选中实体时设置 selectedEntityId', () => {
      useKnowledgeGraphStore.getState().selectEntity('e1');
      expect(useKnowledgeGraphStore.getState().selectedEntityId).toBe('e1');
    });

    it('选中实体时设置高亮段落', () => {
      useKnowledgeGraphStore.getState().selectEntity('e1');
      expect(useKnowledgeGraphStore.getState().highlightParagraphIds).toEqual(['p1']);
    });

    it('选中实体时 pin 住该实体及其邻居', () => {
      useKnowledgeGraphStore.getState().selectEntity('e1');
      const pinned = useKnowledgeGraphStore.getState().pinnedEntityIds;
      expect(pinned.has('e1')).toBe(true);
      expect(pinned.has('e2')).toBe(true);
    });

    it('传 null 时清除选中', () => {
      useKnowledgeGraphStore.getState().selectEntity('e1');
      useKnowledgeGraphStore.getState().selectEntity(null);
      expect(useKnowledgeGraphStore.getState().selectedEntityId).toBeNull();
      expect(useKnowledgeGraphStore.getState().highlightParagraphIds).toEqual([]);
    });

    it('graph 为 null 时不报错', () => {
      useKnowledgeGraphStore.setState({ graph: null });
      expect(() => useKnowledgeGraphStore.getState().selectEntity('e1')).not.toThrow();
    });
  });

  describe('hoverEntity', () => {
    it('设置悬停实体 ID', () => {
      useKnowledgeGraphStore.getState().hoverEntity('e1');
      expect(useKnowledgeGraphStore.getState().hoveredEntityId).toBe('e1');
    });

    it('传 null 清除悬停', () => {
      useKnowledgeGraphStore.getState().hoverEntity('e1');
      useKnowledgeGraphStore.getState().hoverEntity(null);
      expect(useKnowledgeGraphStore.getState().hoveredEntityId).toBeNull();
    });
  });

  describe('addPinnedEntities', () => {
    it('添加 pin 的实体', () => {
      useKnowledgeGraphStore.getState().addPinnedEntities(['e1', 'e2']);
      const pinned = useKnowledgeGraphStore.getState().pinnedEntityIds;
      expect(pinned.has('e1')).toBe(true);
      expect(pinned.has('e2')).toBe(true);
      expect(pinned.size).toBe(2);
    });

    it('空数组不做任何操作', () => {
      const prev = useKnowledgeGraphStore.getState().pinnedEntityIds;
      useKnowledgeGraphStore.getState().addPinnedEntities([]);
      expect(useKnowledgeGraphStore.getState().pinnedEntityIds).toBe(prev);
    });

    it('重复添加保持相同大小', () => {
      useKnowledgeGraphStore.getState().addPinnedEntities(['e1']);
      useKnowledgeGraphStore.getState().addPinnedEntities(['e1']);
      expect(useKnowledgeGraphStore.getState().pinnedEntityIds.size).toBe(1);
    });
  });

  describe('setEntityTypeFilter', () => {
    it('设置实体类型过滤', () => {
      useKnowledgeGraphStore.getState().setEntityTypeFilter(['person', 'term']);
      expect(useKnowledgeGraphStore.getState().entityTypeFilter).toEqual(['person', 'term']);
    });
  });

  describe('setSearchQuery', () => {
    beforeEach(() => {
      useKnowledgeGraphStore.setState({ graph: mockGraph });
    });

    it('设置搜索查询', () => {
      useKnowledgeGraphStore.getState().setSearchQuery('实体');
      expect(useKnowledgeGraphStore.getState().searchQuery).toBe('实体');
    });

    it('搜索匹配的实体被 pin 住', () => {
      useKnowledgeGraphStore.getState().setSearchQuery('实体一');
      const pinned = useKnowledgeGraphStore.getState().pinnedEntityIds;
      expect(pinned.has('e1')).toBe(true);
    });

    it('多个匹配结果都被 pin', () => {
      useKnowledgeGraphStore.getState().setSearchQuery('实体');
      const pinned = useKnowledgeGraphStore.getState().pinnedEntityIds;
      expect(pinned.has('e1')).toBe(true);
      expect(pinned.has('e2')).toBe(true);
      expect(pinned.has('e3')).toBe(true);
    });

    it('空查询不 pin 任何实体', () => {
      useKnowledgeGraphStore.getState().setSearchQuery('实体');
      useKnowledgeGraphStore.getState().setSearchQuery('');
      expect(useKnowledgeGraphStore.getState().searchQuery).toBe('');
    });

    it('搜索不区分大小写', () => {
      useKnowledgeGraphStore.setState({
        graph: {
          ...mockGraph,
          entities: [createMockEntity('e1', 'Apple', 'term')],
        },
      });
      useKnowledgeGraphStore.getState().setSearchQuery('apple');
      expect(useKnowledgeGraphStore.getState().pinnedEntityIds.has('e1')).toBe(true);
    });

    it('graph 为 null 时不报错', () => {
      useKnowledgeGraphStore.setState({ graph: null });
      expect(() => useKnowledgeGraphStore.getState().setSearchQuery('test')).not.toThrow();
    });
  });

  describe('reset', () => {
    it('重置所有状态', () => {
      useKnowledgeGraphStore.setState({
        graph: mockGraph,
        stats: mockStats,
        selectedEntityId: 'e1',
        pinnedEntityIds: new Set(['e1']),
        searchQuery: 'test',
        loading: true,
        error: 'error',
      });
      useKnowledgeGraphStore.getState().reset();
      const state = useKnowledgeGraphStore.getState();
      expect(state.graph).toBeNull();
      expect(state.stats).toBeNull();
      expect(state.selectedEntityId).toBeNull();
      expect(state.pinnedEntityIds.size).toBe(0);
      expect(state.searchQuery).toBe('');
      expect(state.loading).toBe(false);
      expect(state.error).toBeNull();
    });
  });

  describe('expandEntity', () => {
    const expandedGraph: KnowledgeGraph = {
      entities: [
        ...mockGraph.entities,
        createMockEntity('e4', '新实体', 'organization', 2),
        createMockEntity('e5', '另一实体', 'term', 1),
      ],
      relations: [
        ...mockGraph.relations,
        { id: 'r3', sourceId: 'e1', targetId: 'e4', type: 'dependency', weight: 1, evidence: [] },
        { id: 'r4', sourceId: 'e4', targetId: 'e5', type: 'cooccurrence', weight: 1, evidence: [] },
      ],
    };

    beforeEach(() => {
      useKnowledgeGraphStore.setState({ graph: mockGraph });
      vi.mocked(knowledgeGraphApi.expand).mockResolvedValue(expandedGraph);
    });

    it('展开实体后新增实体和关系', async () => {
      await useKnowledgeGraphStore.getState().expandEntity('e1');
      const state = useKnowledgeGraphStore.getState();
      expect(state.graph?.entities.length).toBe(5);
      expect(state.graph?.relations.length).toBe(4);
    });

    it('展开实体后 pin 住新实体', async () => {
      await useKnowledgeGraphStore.getState().expandEntity('e1');
      const pinned = useKnowledgeGraphStore.getState().pinnedEntityIds;
      expect(pinned.has('e1')).toBe(true);
      expect(pinned.has('e4')).toBe(true);
      expect(pinned.has('e5')).toBe(true);
    });

    it('已展开的实体不重复展开', async () => {
      await useKnowledgeGraphStore.getState().expandEntity('e1');
      const prevGraph = useKnowledgeGraphStore.getState().graph;
      await useKnowledgeGraphStore.getState().expandEntity('e1');
      expect(useKnowledgeGraphStore.getState().graph).toBe(prevGraph);
    });

    it('展开失败时仍标记为已展开', async () => {
      vi.mocked(knowledgeGraphApi.expand).mockRejectedValue(new Error('fail'));
      await useKnowledgeGraphStore.getState().expandEntity('e2');
      expect(useKnowledgeGraphStore.getState().expandedEntityIds.has('e2')).toBe(true);
    });
  });

  describe('loadForDocument', () => {
    beforeEach(() => {
      vi.mocked(knowledgeGraphApi.forDocument).mockResolvedValue(mockGraph);
      vi.mocked(knowledgeGraphApi.statsForDocument).mockResolvedValue(mockStats);
    });

    it('加载文档图谱', async () => {
      await useKnowledgeGraphStore.getState().loadForDocument('doc1');
      const state = useKnowledgeGraphStore.getState();
      expect(state.graph).toEqual(mockGraph);
      expect(state.stats).toEqual(mockStats);
      expect(state.loading).toBe(false);
    });

    it('加载前清空 pinned 实体', async () => {
      useKnowledgeGraphStore.setState({ pinnedEntityIds: new Set(['old']) });
      await useKnowledgeGraphStore.getState().loadForDocument('doc1');
      expect(useKnowledgeGraphStore.getState().pinnedEntityIds.size).toBe(0);
    });

    it('加载错误时设置 error', async () => {
      vi.mocked(knowledgeGraphApi.forDocument).mockRejectedValue(new Error('load failed'));
      await useKnowledgeGraphStore.getState().loadForDocument('doc1');
      expect(useKnowledgeGraphStore.getState().error).toBe('load failed');
      expect(useKnowledgeGraphStore.getState().loading).toBe(false);
    });
  });

  describe('loadForAll', () => {
    beforeEach(() => {
      vi.mocked(knowledgeGraphApi.forAll).mockResolvedValue(mockGraph);
      vi.mocked(knowledgeGraphApi.statsForAll).mockResolvedValue(mockStats);
    });

    it('加载全局图谱', async () => {
      await useKnowledgeGraphStore.getState().loadForAll();
      const state = useKnowledgeGraphStore.getState();
      expect(state.graph).toEqual(mockGraph);
      expect(state.stats).toEqual(mockStats);
    });
  });
});
