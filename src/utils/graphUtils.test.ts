import { describe, it, expect } from 'vitest';
import {
  computeStatsLocally,
  getNeighborEntityIds,
  computeGraphBoundingBox,
  getNodeRadius,
} from './graphUtils';
import type { KnowledgeGraph, Entity, Relation } from '../types';

const createMockEntity = (
  id: string,
  name: string,
  type: Entity['type'] = 'term',
  frequency: number = 1,
  sentiment: Entity['sentiment'] = 'neutral'
): Entity => ({
  id,
  name,
  type,
  frequency,
  docIds: ['doc1'],
  paragraphIds: ['p1'],
  summary: `${name} 的摘要`,
  sentiment,
  sentimentScore: 0,
});

const createMockRelation = (
  id: string,
  sourceId: string,
  targetId: string,
  type: Relation['type'] = 'cooccurrence',
  weight: number = 1
): Relation => ({
  id,
  sourceId,
  targetId,
  type,
  weight,
  evidence: [],
});

describe('graphUtils', () => {
  describe('getNodeRadius', () => {
    it('返回最小半径 6 当 frequency 很小时', () => {
      expect(getNodeRadius(0)).toBe(6);
      expect(getNodeRadius(1)).toBeGreaterThanOrEqual(6);
    });

    it('返回最大半径 20 当 frequency 很大时', () => {
      expect(getNodeRadius(1000)).toBe(20);
      expect(getNodeRadius(10000)).toBe(20);
    });

    it('frequency 越大半径越大', () => {
      const r1 = getNodeRadius(1);
      const r2 = getNodeRadius(10);
      const r3 = getNodeRadius(50);
      expect(r2).toBeGreaterThan(r1);
      expect(r3).toBeGreaterThan(r2);
    });

    it('所有返回值都在 [6, 20] 范围内', () => {
      for (let i = 0; i < 100; i++) {
        const r = getNodeRadius(i);
        expect(r).toBeGreaterThanOrEqual(6);
        expect(r).toBeLessThanOrEqual(20);
      }
    });
  });

  describe('computeGraphBoundingBox', () => {
    it('返回正确的边界框', () => {
      const nodes = [
        { x: 10, y: 20 },
        { x: 30, y: 40 },
        { x: -5, y: 50 },
      ];
      const bbox = computeGraphBoundingBox(nodes);
      expect(bbox.minX).toBe(-5);
      expect(bbox.maxX).toBe(30);
      expect(bbox.minY).toBe(20);
      expect(bbox.maxY).toBe(50);
    });

    it('空节点数组返回零边界框', () => {
      const bbox = computeGraphBoundingBox([]);
      expect(bbox.minX).toBe(0);
      expect(bbox.maxX).toBe(0);
      expect(bbox.minY).toBe(0);
      expect(bbox.maxY).toBe(0);
    });

    it('x 和 y 分别独立判断，缺失的坐标不参与对应维度计算', () => {
      const nodes = [
        { x: 10, y: 20 },
        { x: undefined, y: 30 },
        { x: 40, y: undefined },
      ];
      const bbox = computeGraphBoundingBox(nodes);
      expect(bbox.minX).toBe(10);
      expect(bbox.maxX).toBe(40);
      expect(bbox.minY).toBe(20);
      expect(bbox.maxY).toBe(30);
    });

    it('单个节点返回正确边界框', () => {
      const nodes = [{ x: 5, y: 10 }];
      const bbox = computeGraphBoundingBox(nodes);
      expect(bbox.minX).toBe(5);
      expect(bbox.maxX).toBe(5);
      expect(bbox.minY).toBe(10);
      expect(bbox.maxY).toBe(10);
    });

    it('跳过值为 NaN 的坐标', () => {
      const nodes = [
        { x: 10, y: 20 },
        { x: NaN, y: 30 },
        { x: 40, y: NaN },
      ];
      const bbox = computeGraphBoundingBox(nodes);
      expect(bbox.minX).toBe(10);
      expect(bbox.maxX).toBe(40);
      expect(bbox.minY).toBe(20);
      expect(bbox.maxY).toBe(30);
    });

    it('跳过值为 Infinity 的坐标', () => {
      const nodes = [
        { x: 10, y: 20 },
        { x: Infinity, y: 30 },
        { x: 40, y: -Infinity },
      ];
      const bbox = computeGraphBoundingBox(nodes);
      expect(bbox.minX).toBe(10);
      expect(bbox.maxX).toBe(40);
      expect(bbox.minY).toBe(20);
      expect(bbox.maxY).toBe(30);
    });

    it('只有 x 坐标时 y 返回 0', () => {
      const nodes = [{ x: 10, y: undefined }, { x: 20, y: undefined }];
      const bbox = computeGraphBoundingBox(nodes);
      expect(bbox.minX).toBe(10);
      expect(bbox.maxX).toBe(20);
      expect(bbox.minY).toBe(0);
      expect(bbox.maxY).toBe(0);
    });

    it('只有 y 坐标时 x 返回 0', () => {
      const nodes = [{ x: undefined, y: 10 }, { x: undefined, y: 20 }];
      const bbox = computeGraphBoundingBox(nodes);
      expect(bbox.minX).toBe(0);
      expect(bbox.maxX).toBe(0);
      expect(bbox.minY).toBe(10);
      expect(bbox.maxY).toBe(20);
    });
  });

  describe('getNeighborEntityIds', () => {
    const graph: KnowledgeGraph = {
      entities: [
        createMockEntity('a', 'A'),
        createMockEntity('b', 'B'),
        createMockEntity('c', 'C'),
        createMockEntity('d', 'D'),
        createMockEntity('e', 'E'),
      ],
      relations: [
        createMockRelation('r1', 'a', 'b'),
        createMockRelation('r2', 'b', 'c'),
        createMockRelation('r3', 'c', 'd'),
        createMockRelation('r4', 'a', 'e'),
      ],
    };

    it('深度 1 只返回直接邻居 + 自身', () => {
      const neighbors = getNeighborEntityIds(graph, 'a', 1);
      expect(neighbors.size).toBe(3);
      expect(neighbors.has('a')).toBe(true);
      expect(neighbors.has('b')).toBe(true);
      expect(neighbors.has('e')).toBe(true);
    });

    it('深度 2 返回二级邻居', () => {
      const neighbors = getNeighborEntityIds(graph, 'a', 2);
      expect(neighbors.size).toBe(4);
      expect(neighbors.has('a')).toBe(true);
      expect(neighbors.has('b')).toBe(true);
      expect(neighbors.has('c')).toBe(true);
      expect(neighbors.has('e')).toBe(true);
      expect(neighbors.has('d')).toBe(false);
    });

    it('深度 3 返回三级邻居', () => {
      const neighbors = getNeighborEntityIds(graph, 'a', 3);
      expect(neighbors.size).toBe(5);
      expect(neighbors.has('d')).toBe(true);
    });

    it('默认深度为 1', () => {
      const neighbors = getNeighborEntityIds(graph, 'a');
      expect(neighbors.size).toBe(3);
    });

    it('graph 为 null 时返回空集合', () => {
      const neighbors = getNeighborEntityIds(null, 'a');
      expect(neighbors.size).toBe(0);
    });

    it('孤立节点只返回自身', () => {
      const isolatedGraph: KnowledgeGraph = {
        entities: [createMockEntity('x', 'X')],
        relations: [],
      };
      const neighbors = getNeighborEntityIds(isolatedGraph, 'x');
      expect(neighbors.size).toBe(1);
      expect(neighbors.has('x')).toBe(true);
    });

    it('双向关系正确处理', () => {
      const g: KnowledgeGraph = {
        entities: [createMockEntity('a', 'A'), createMockEntity('b', 'B')],
        relations: [createMockRelation('r1', 'b', 'a')],
      };
      const neighbors = getNeighborEntityIds(g, 'a');
      expect(neighbors.has('b')).toBe(true);
    });
  });

  describe('computeStatsLocally', () => {
    const graph: KnowledgeGraph = {
      entities: [
        createMockEntity('p1', '张三', 'person', 5, 'positive'),
        createMockEntity('p2', '李四', 'person', 3, 'neutral'),
        createMockEntity('l1', '北京', 'location', 10, 'positive'),
        createMockEntity('o1', '公司A', 'organization', 2, 'negative'),
        createMockEntity('t1', '机器学习', 'term', 8, 'neutral'),
      ],
      relations: [
        createMockRelation('r1', 'p1', 'l1', 'citation', 2),
        createMockRelation('r2', 'p1', 't1', 'dependency', 3),
        createMockRelation('r3', 'p2', 'o1', 'comparison', 1),
        createMockRelation('r4', 'l1', 't1', 'cooccurrence', 2),
        createMockRelation('r5', 'o1', 't1', 'cooccurrence', 1),
      ],
    };

    it('正确统计实体总数', () => {
      const stats = computeStatsLocally(graph);
      expect(stats.totalEntities).toBe(5);
    });

    it('正确统计关系总数', () => {
      const stats = computeStatsLocally(graph);
      expect(stats.totalRelations).toBe(5);
    });

    it('正确按类型统计实体', () => {
      const stats = computeStatsLocally(graph);
      expect(stats.byType.person).toBe(2);
      expect(stats.byType.location).toBe(1);
      expect(stats.byType.organization).toBe(1);
      expect(stats.byType.term).toBe(1);
    });

    it('正确按类型统计关系', () => {
      const stats = computeStatsLocally(graph);
      expect(stats.byRelationType.citation).toBe(1);
      expect(stats.byRelationType.dependency).toBe(1);
      expect(stats.byRelationType.comparison).toBe(1);
      expect(stats.byRelationType.cooccurrence).toBe(2);
    });

    it('正确计算情感分布', () => {
      const stats = computeStatsLocally(graph);
      expect(stats.sentimentDistribution.positive).toBe(2);
      expect(stats.sentimentDistribution.neutral).toBe(2);
      expect(stats.sentimentDistribution.negative).toBe(1);
    });

    it('返回 top 20 实体按关系数排序', () => {
      const stats = computeStatsLocally(graph);
      expect(stats.topEntities.length).toBeLessThanOrEqual(20);
      expect(stats.topEntities.length).toBe(5);
      const relationCounts = stats.topEntities.map((e) => e.relationCount);
      for (let i = 1; i < relationCounts.length; i++) {
        expect(relationCounts[i - 1]).toBeGreaterThanOrEqual(relationCounts[i]);
      }
    });

    it('关系最多的实体排在最前', () => {
      const stats = computeStatsLocally(graph);
      expect(stats.topEntities[0].entity.id).toBe('t1');
      expect(stats.topEntities[0].relationCount).toBe(3);
    });

    it('空图返回零统计', () => {
      const emptyGraph: KnowledgeGraph = { entities: [], relations: [] };
      const stats = computeStatsLocally(emptyGraph);
      expect(stats.totalEntities).toBe(0);
      expect(stats.totalRelations).toBe(0);
      expect(stats.topEntities.length).toBe(0);
    });
  });
});
