import { useMemo } from 'react';
import { Users, MapPin, Building2, BookOpen, Link2, TrendingUp, BarChart3, FileText, Hash } from 'lucide-react';
import type { Entity, EntityStats, EntityType, SentimentType } from '../../types';

const ENTITY_LABELS: Record<EntityType, string> = {
  person: '人物',
  location: '地点',
  organization: '组织',
  term: '术语',
};

const ENTITY_ICONS: Record<EntityType, React.ComponentType<{ size?: string | number; style?: React.CSSProperties }>> = {
  person: Users,
  location: MapPin,
  organization: Building2,
  term: BookOpen,
};

const SENTIMENT_LABELS: Record<SentimentType, string> = {
  positive: '正面',
  neutral: '中性',
  negative: '负面',
};

const SENTIMENT_COLORS: Record<SentimentType, string> = {
  positive: '#10b981',
  neutral: '#94a3b8',
  negative: '#ef4444',
};

const ENTITY_COLORS: Record<EntityType, string> = {
  person: '#3b82f6',
  location: '#10b981',
  organization: '#8b5cf6',
  term: '#f59e0b',
};

interface EntityStatsPanelProps {
  stats: EntityStats | null;
  selectedEntity: Entity | null;
  onEntityTypeClick: (type: EntityType) => void;
  entityTypeFilter: EntityType[];
}

export function EntityStatsPanel({
  stats,
  selectedEntity,
  onEntityTypeClick,
  entityTypeFilter,
}: EntityStatsPanelProps) {
  const sentimentTotal = useMemo(() => {
    if (!stats) return 1;
    return stats.sentimentDistribution.positive + stats.sentimentDistribution.neutral + stats.sentimentDistribution.negative || 1;
  }, [stats]);

  if (!stats) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-sm text-slate-400">
        暂无统计数据
      </div>
    );
  }

  const maxFreq = stats.topEntities.length > 0
    ? Math.max(...stats.topEntities.slice(0, 10).map(({ entity }) => entity.frequency))
    : 1;

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="border-b border-slate-100 p-4">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold text-slate-800">
          <BarChart3 size={14} />
          知识图谱统计
        </h3>
      </div>

      <div className="space-y-4 p-4">
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg bg-blue-50 p-3 text-center">
            <div className="text-lg font-bold text-blue-600">{stats.totalEntities}</div>
            <div className="text-xs text-blue-500">实体总数</div>
          </div>
          <div className="rounded-lg bg-purple-50 p-3 text-center">
            <div className="text-lg font-bold text-purple-600">{stats.totalRelations}</div>
            <div className="text-xs text-purple-500">关系总数</div>
          </div>
        </div>

        <div>
          <h4 className="mb-2 text-xs font-medium text-slate-500">实体类型分布</h4>
          <div className="space-y-1.5">
            {(['person', 'location', 'organization', 'term'] as EntityType[]).map((type) => {
              const Icon = ENTITY_ICONS[type];
              const count = stats.byType[type];
              const pct = stats.totalEntities > 0 ? (count / stats.totalEntities) * 100 : 0;
              const isActive = entityTypeFilter.includes(type);
              return (
                <button
                  key={type}
                  onClick={() => onEntityTypeClick(type)}
                  className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left transition-colors ${
                    isActive ? 'bg-slate-50 hover:bg-slate-100' : 'opacity-40'
                  }`}
                >
                  <Icon size={14} style={{ color: ENTITY_COLORS[type] }} />
                  <span className="text-xs font-medium text-slate-700">{ENTITY_LABELS[type]}</span>
                  <span className="ml-auto text-xs font-semibold" style={{ color: ENTITY_COLORS[type] }}>
                    {count}
                  </span>
                  <div className="h-1.5 w-12 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${pct}%`, backgroundColor: ENTITY_COLORS[type] }}
                    />
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <h4 className="mb-2 text-xs font-medium text-slate-500">情感倾向分布</h4>
          <div className="flex h-4 overflow-hidden rounded-full">
            {(['positive', 'neutral', 'negative'] as SentimentType[]).map((s) => {
              const count = stats.sentimentDistribution[s];
              const pct = (count / sentimentTotal) * 100;
              return (
                <div
                  key={s}
                  className="flex items-center justify-center text-[10px] font-medium text-white"
                  style={{
                    width: `${pct}%`,
                    backgroundColor: SENTIMENT_COLORS[s],
                    minWidth: count > 0 ? '8px' : '0',
                  }}
                  title={`${SENTIMENT_LABELS[s]}: ${count} (${pct.toFixed(1)}%)`}
                >
                  {pct > 15 ? count : ''}
                </div>
              );
            })}
          </div>
          <div className="mt-1.5 flex justify-between text-[10px] text-slate-500">
            {(['positive', 'neutral', 'negative'] as SentimentType[]).map((s) => (
              <span key={s} className="flex items-center gap-1">
                <span
                  className="inline-block h-1.5 w-1.5 rounded-full"
                  style={{ backgroundColor: SENTIMENT_COLORS[s] }}
                />
                {SENTIMENT_LABELS[s]} {stats.sentimentDistribution[s]}
              </span>
            ))}
          </div>
        </div>

        <div>
          <h4 className="mb-2 text-xs font-medium text-slate-500">关系类型分布</h4>
          <div className="space-y-1">
            {(['citation', 'dependency', 'comparison', 'cooccurrence'] as const).map((type) => {
              const count = stats.byRelationType[type];
              const label = { citation: '引用', dependency: '依赖', comparison: '对比', cooccurrence: '共现' }[type];
              const maxCount = Math.max(...Object.values(stats.byRelationType), 1);
              const pct = (count / maxCount) * 100;
              const color = { citation: '#ef4444', dependency: '#3b82f6', comparison: '#f59e0b', cooccurrence: '#94a3b8' }[type];
              return (
                <div key={type} className="flex items-center gap-2">
                  <Link2 size={10} className="text-slate-400" />
                  <span className="w-8 text-xs text-slate-600">{label}</span>
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${pct}%`, backgroundColor: color }}
                    />
                  </div>
                  <span className="w-6 text-right text-xs font-medium text-slate-600">{count}</span>
                </div>
              );
            })}
          </div>
        </div>

        <div>
          <h4 className="mb-2 flex items-center gap-1 text-xs font-medium text-slate-500">
            <TrendingUp size={12} />
            高关联度实体 Top 10
          </h4>
          <div className="space-y-0.5">
            {stats.topEntities.slice(0, 10).map(({ entity, relationCount }, i) => (
              <div
                key={entity.id}
                className="flex items-center gap-2 rounded px-2 py-1.5 text-xs hover:bg-slate-50"
              >
                <span className="w-4 text-center font-bold text-slate-400">{i + 1}</span>
                <span
                  className="inline-block h-2 w-2 rounded-full"
                  style={{ backgroundColor: ENTITY_COLORS[entity.type] }}
                />
                <span className="flex-1 truncate font-medium text-slate-700">{entity.name}</span>
                <span className="text-slate-400">{relationCount} 关联</span>
              </div>
            ))}
          </div>
        </div>

        <div>
          <h4 className="mb-2 flex items-center gap-1 text-xs font-medium text-slate-500">
            <Hash size={12} />
            出现频次排行
          </h4>
          <div className="space-y-0.5">
            {stats.topEntities.slice(0, 8).map(({ entity }) => {
              const freqPct = maxFreq > 0 ? (entity.frequency / maxFreq) * 100 : 0;
              return (
                <div key={`freq-${entity.id}`} className="flex items-center gap-2 px-2 py-1 text-xs">
                  <span
                    className="inline-block h-2 w-2 rounded-full"
                    style={{ backgroundColor: ENTITY_COLORS[entity.type] }}
                  />
                  <span className="w-16 truncate font-medium text-slate-700">{entity.name}</span>
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${freqPct}%`, backgroundColor: ENTITY_COLORS[entity.type] }}
                    />
                  </div>
                  <span className="w-5 text-right text-slate-500">{entity.frequency}</span>
                </div>
              );
            })}
          </div>
        </div>

        <div>
          <h4 className="mb-2 flex items-center gap-1 text-xs font-medium text-slate-500">
            <FileText size={12} />
            关联文档数排行
          </h4>
          <div className="space-y-0.5">
            {stats.topEntities
              .slice(0, 8)
              .sort((a, b) => b.entity.docIds.length - a.entity.docIds.length)
              .map(({ entity }) => {
                const maxDocs = Math.max(...stats.topEntities.slice(0, 8).map(e => e.entity.docIds.length), 1);
                const docPct = (entity.docIds.length / maxDocs) * 100;
                return (
                  <div key={`docs-${entity.id}`} className="flex items-center gap-2 px-2 py-1 text-xs">
                    <span
                      className="inline-block h-2 w-2 rounded-full"
                      style={{ backgroundColor: ENTITY_COLORS[entity.type] }}
                    />
                    <span className="w-16 truncate font-medium text-slate-700">{entity.name}</span>
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full bg-emerald-400"
                        style={{ width: `${docPct}%` }}
                      />
                    </div>
                    <span className="w-5 text-right text-slate-500">{entity.docIds.length}</span>
                  </div>
                );
              })}
          </div>
        </div>
      </div>

      {selectedEntity && (
        <div className="mt-auto border-t border-slate-100 bg-slate-50 p-4">
          <h4 className="mb-2 text-xs font-semibold text-slate-700">选中实体详情</h4>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span
                className="inline-block h-3 w-3 rounded-full"
                style={{ backgroundColor: ENTITY_COLORS[selectedEntity.type] }}
              />
              <span className="text-sm font-semibold text-slate-900">{selectedEntity.name}</span>
              <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
                {ENTITY_LABELS[selectedEntity.type]}
              </span>
            </div>
            <p className="text-xs text-slate-500">{selectedEntity.summary}</p>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded bg-white p-1.5">
                <div className="text-sm font-bold text-slate-700">{selectedEntity.frequency}</div>
                <div className="text-[10px] text-slate-400">出现频次</div>
              </div>
              <div className="rounded bg-white p-1.5">
                <div className="text-sm font-bold text-slate-700">{selectedEntity.docIds.length}</div>
                <div className="text-[10px] text-slate-400">关联文档</div>
              </div>
              <div className="rounded bg-white p-1.5">
                <div
                  className="text-sm font-bold"
                  style={{ color: SENTIMENT_COLORS[selectedEntity.sentiment] }}
                >
                  {SENTIMENT_LABELS[selectedEntity.sentiment]}
                </div>
                <div className="text-[10px] text-slate-400">情感倾向</div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 text-center">
              <div className="rounded bg-white p-1.5">
                <div className="text-sm font-bold text-slate-700">{selectedEntity.paragraphIds.length}</div>
                <div className="text-[10px] text-slate-400">涉及段落</div>
              </div>
              <div className="rounded bg-white p-1.5">
                <div className="text-sm font-bold text-slate-700">
                  {selectedEntity.sentimentScore > 0 ? '+' : ''}{selectedEntity.sentimentScore}
                </div>
                <div className="text-[10px] text-slate-400">情感分数</div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
