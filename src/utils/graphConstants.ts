import type { EntityType, RelationType } from '../types';

export const ENTITY_COLORS: Record<EntityType, string> = {
  person: '#3b82f6',
  location: '#10b981',
  organization: '#8b5cf6',
  term: '#f59e0b',
};

export const RELATION_COLORS: Record<RelationType, string> = {
  citation: '#ef4444',
  dependency: '#3b82f6',
  comparison: '#f59e0b',
  cooccurrence: '#94a3b8',
};

export const ENTITY_LABELS: Record<EntityType, string> = {
  person: '人物',
  location: '地点',
  organization: '组织',
  term: '术语',
};

export const RELATION_LABELS: Record<RelationType, string> = {
  citation: '引用',
  dependency: '依赖',
  comparison: '对比',
  cooccurrence: '共现',
};

export const VIRTUALIZATION_THRESHOLD = 200;
export const INCREMENTAL_BATCH_SIZE = 50;
export const FORCE_LINK_DISTANCE = 80;
export const FORCE_CHARGE_STRENGTH = -200;
export const EXPORT_TICKS_TO_STABILIZE = 300;
