import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  ArrowLeft,
  Image,
  FileCode,
  Network,
  RefreshCw,
  ChevronRight,
  X,
  Search,
} from 'lucide-react';
import { useKnowledgeGraphStore } from '../store/knowledgeGraphStore';
import { ForceGraph } from '../components/KnowledgeGraph/ForceGraph';
import { EntityStatsPanel } from '../components/KnowledgeGraph/EntityStatsPanel';
import { documentsApi } from '../utils/api';
import type { DocumentMeta, EntityType, Paragraph } from '../types';

export function KnowledgeGraphPage() {
  const { docId } = useParams<{ docId: string }>();
  const [docMeta, setDocMeta] = useState<DocumentMeta | null>(null);
  const [showParagraphPanel, setShowParagraphPanel] = useState(false);
  const [paragraphs, setParagraphs] = useState<Paragraph[]>([]);
  const exportPngRef = useRef<(() => void) | null>(null);
  const exportSvgRef = useRef<(() => void) | null>(null);
  const [searchInput, setSearchInput] = useState('');

  const {
    graph,
    stats,
    selectedEntityId,
    hoveredEntityId,
    entityTypeFilter,
    pinnedEntityIds,
    highlightParagraphIds,
    searchQuery,
    loading,
    error,
    loadForDocument,
    loadForAll,
    selectEntity,
    hoverEntity,
    expandEntity,
    setEntityTypeFilter,
    setSearchQuery,
    reset,
  } = useKnowledgeGraphStore();

  const selectedEntity = useMemo(() => {
    if (!graph || !selectedEntityId) return null;
    return graph.entities.find((e) => e.id === selectedEntityId) || null;
  }, [graph, selectedEntityId]);

  const selectedEntityRelations = useMemo(() => {
    if (!graph || !selectedEntityId) return [];
    return graph.relations.filter(
      (r) => r.sourceId === selectedEntityId || r.targetId === selectedEntityId
    );
  }, [graph, selectedEntityId]);

  useEffect(() => {
    if (docId) {
      documentsApi.get(docId).then(setDocMeta).catch(() => {});
      documentsApi.getParsed(docId).then((p) => setParagraphs(p.paragraphs)).catch(() => {});
      loadForDocument(docId);
    } else {
      loadForAll();
    }
    return () => reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docId]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchQuery(searchInput);
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  const handleEntityTypeClick = (type: EntityType) => {
    const newFilter = entityTypeFilter.includes(type)
      ? entityTypeFilter.filter((t) => t !== type)
      : [...entityTypeFilter, type];
    if (newFilter.length > 0) setEntityTypeFilter(newFilter);
  };

  const handleEntityClick = (entityId: string) => {
    selectEntity(entityId);
    setShowParagraphPanel(true);
  };

  const handleEntityDoubleClick = (entityId: string) => {
    expandEntity(entityId);
  };

  const handleExportPng = () => {
    exportPngRef.current?.();
  };

  const handleExportSvg = () => {
    exportSvgRef.current?.();
  };

  const highlightedParagraphs = useMemo(() => {
    if (highlightParagraphIds.length === 0) return [];
    return paragraphs.filter((p) => highlightParagraphIds.includes(p.id));
  }, [paragraphs, highlightParagraphIds]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="text-center">
          <RefreshCw size={24} className="mx-auto mb-3 animate-spin text-slate-400" />
          <p className="text-sm text-slate-500">正在构建知识图谱…</p>
          <p className="mt-1 text-xs text-slate-400">抽取实体、分析关系、计算布局</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
        <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <h2 className="mb-1 text-lg font-semibold text-slate-900">加载失败</h2>
          <p className="mb-5 text-sm text-slate-500">{error}</p>
          <Link
            to="/"
            className="inline-flex items-center gap-1 rounded-md bg-[#1e3a5f] px-4 py-2 text-sm font-medium text-white hover:bg-[#2e4e7a]"
          >
            <ArrowLeft size={14} /> 返回首页
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-slate-50">
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-2.5">
        <div className="flex items-center gap-3">
          <Link
            to={docId ? `/admin/${docId}` : '/'}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm text-slate-600 hover:bg-slate-100"
          >
            <ArrowLeft size={14} />
          </Link>
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#1e3a5f]/10 text-[#1e3a5f]">
            <Network size={16} />
          </div>
          <div>
            <h1 className="text-sm font-semibold text-slate-900">
              {docMeta ? `${docMeta.title} - 知识图谱` : '全局知识图谱'}
            </h1>
            <p className="text-xs text-slate-500">
              {graph ? `${graph.entities.length} 个实体 · ${graph.relations.length} 条关系` : '加载中…'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="搜索实体…"
              className="h-8 w-44 rounded-md border border-slate-200 bg-slate-50 pl-8 pr-3 text-xs text-slate-700 outline-none transition-colors focus:border-blue-300 focus:bg-white"
            />
            {searchInput && (
              <button
                onClick={() => { setSearchInput(''); setSearchQuery(''); }}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X size={12} />
              </button>
            )}
          </div>

          <div className="h-5 w-px bg-slate-200" />

          <button
            onClick={() => {
              if (docId) loadForDocument(docId);
              else loadForAll();
            }}
            className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 hover:bg-slate-50"
          >
            <RefreshCw size={12} /> 刷新
          </button>
          <button
            onClick={handleExportPng}
            className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 hover:bg-slate-50"
          >
            <Image size={12} /> PNG
          </button>
          <button
            onClick={handleExportSvg}
            className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 hover:bg-slate-50"
          >
            <FileCode size={12} /> SVG
          </button>
          {selectedEntityId && (
            <button
              onClick={() => { selectEntity(null); setShowParagraphPanel(false); }}
              className="inline-flex items-center gap-1 rounded-md bg-[#1e3a5f] px-2.5 py-1.5 text-xs font-medium text-white hover:bg-[#2e4e7a]"
            >
              <X size={12} /> 清除选中
            </button>
          )}
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <div className="relative flex-1">
          {graph && graph.entities.length > 0 ? (
            <ForceGraph
              entities={graph.entities}
              relations={graph.relations}
              selectedEntityId={selectedEntityId}
              hoveredEntityId={hoveredEntityId}
              entityTypeFilter={entityTypeFilter}
              pinnedEntityIds={pinnedEntityIds}
              searchQuery={searchQuery}
              onEntityClick={handleEntityClick}
              onEntityDoubleClick={handleEntityDoubleClick}
              onEntityHover={hoverEntity}
              exportPngRef={exportPngRef}
              exportSvgRef={exportSvgRef}
            />
          ) : (
            <div className="flex h-full items-center justify-center">
              <div className="text-center">
                <Network size={48} strokeWidth={1} className="mx-auto mb-3 text-slate-300" />
                <p className="text-sm text-slate-500">暂无实体数据</p>
                <p className="mt-1 text-xs text-slate-400">上传文档后系统将自动提取实体并构建知识图谱</p>
              </div>
            </div>
          )}

          {showParagraphPanel && selectedEntity && (
            <div className="absolute right-0 top-0 flex h-full w-80 flex-col border-l border-slate-200 bg-white shadow-lg">
              <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                <div>
                  <h3 className="text-xs font-semibold text-slate-700">
                    {selectedEntity.name}
                  </h3>
                  <p className="text-[10px] text-slate-400">
                    {highlightedParagraphs.length} 个相关段落 · {selectedEntityRelations.length} 条关联关系
                  </p>
                </div>
                <button
                  onClick={() => setShowParagraphPanel(false)}
                  className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                >
                  <X size={14} />
                </button>
              </div>

              {selectedEntityRelations.length > 0 && (
                <div className="border-b border-slate-100 px-4 py-3">
                  <h4 className="mb-2 text-[10px] font-medium text-slate-500">关联关系</h4>
                  <div className="space-y-1">
                    {selectedEntityRelations.slice(0, 8).map((r) => {
                      const otherEntity = graph?.entities.find(
                        (e) => e.id === (r.sourceId === selectedEntityId ? r.targetId : r.sourceId)
                      );
                      const direction = r.sourceId === selectedEntityId ? '→' : '←';
                      const relLabel = { citation: '引用', dependency: '依赖', comparison: '对比', cooccurrence: '共现' }[r.type];
                      return (
                        <div key={r.id} className="flex items-center gap-1 text-[11px] text-slate-600">
                          <span className="font-medium">{direction}</span>
                          <span className="rounded bg-slate-100 px-1 py-0.5 text-[10px]">{relLabel}</span>
                          <span className="font-medium text-slate-800">{otherEntity?.name || '未知'}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="flex-1 overflow-y-auto">
                {highlightedParagraphs.length === 0 ? (
                  <p className="py-8 text-center text-xs text-slate-400">无相关段落</p>
                ) : (
                  <div className="space-y-0">
                    {highlightedParagraphs.map((p) => {
                      const entityName = selectedEntity.name;
                      const content = p.content;
                      const highlightIndex = content.indexOf(entityName);
                      return (
                        <button
                          key={p.id}
                          onClick={() => {
                            if (docId) {
                              window.open(`/admin/${docId}?highlight=${p.id}`, '_blank');
                            }
                          }}
                          className="w-full border-b border-slate-50 px-4 py-3 text-left transition-colors hover:bg-blue-50/50"
                        >
                          <div className="mb-1 flex items-center gap-1 text-[10px] text-slate-400">
                            <ChevronRight size={10} />
                            段落 #{p.index + 1} · {p.type}
                          </div>
                          <p className="text-xs leading-relaxed text-slate-700">
                            {highlightIndex >= 0 ? (
                              <>
                                {content.slice(0, highlightIndex)}
                                <mark className="rounded bg-yellow-200/80 px-0.5">{entityName}</mark>
                                {content.slice(highlightIndex + entityName.length, highlightIndex + entityName.length + 120)}
                                {content.length > highlightIndex + entityName.length + 120 ? '…' : ''}
                              </>
                            ) : (
                              <>
                                {content.slice(0, 150)}
                                {content.length > 150 ? '…' : ''}
                              </>
                            )}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="border-t border-slate-100 px-4 py-2">
                <p className="text-center text-[10px] text-slate-400">
                  点击段落可在文档中定位
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="w-72 shrink-0 border-l border-slate-200 bg-white">
          <EntityStatsPanel
            stats={stats}
            selectedEntity={selectedEntity}
            onEntityTypeClick={handleEntityTypeClick}
            entityTypeFilter={entityTypeFilter}
          />
        </div>
      </div>
    </div>
  );
}
