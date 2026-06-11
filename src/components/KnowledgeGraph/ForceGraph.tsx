import { useEffect, useRef, useCallback, useMemo, useState } from 'react';
import * as d3 from 'd3';
import type { Entity, Relation, EntityType, RelationType } from '../../types';
import {
  ENTITY_COLORS,
  RELATION_COLORS,
  ENTITY_LABELS,
  RELATION_LABELS,
  VIRTUALIZATION_THRESHOLD,
  INCREMENTAL_BATCH_SIZE,
  FORCE_LINK_DISTANCE,
  FORCE_CHARGE_STRENGTH,
} from '../../utils/graphConstants';
import { getNodeRadius } from '../../utils/graphUtils';
import { GraphLegend } from './GraphLegend';
import { GraphMinimap } from './GraphMinimap';
import {
  useForceGraphExport,
  type GraphNode,
  type GraphLink,
} from '../../hooks/useForceGraphExport';

interface ForceGraphProps {
  entities: Entity[];
  relations: Relation[];
  selectedEntityId: string | null;
  hoveredEntityId: string | null;
  entityTypeFilter: EntityType[];
  pinnedEntityIds: Set<string>;
  searchQuery: string;
  onEntityClick: (entityId: string) => void;
  onEntityDoubleClick: (entityId: string) => void;
  onEntityHover: (entityId: string | null) => void;
  exportPngRef: React.MutableRefObject<(() => void) | null>;
  exportSvgRef: React.MutableRefObject<(() => void) | null>;
}

export function ForceGraph({
  entities,
  relations,
  selectedEntityId,
  hoveredEntityId,
  entityTypeFilter,
  pinnedEntityIds,
  searchQuery,
  onEntityClick,
  onEntityDoubleClick,
  onEntityHover,
  exportPngRef,
  exportSvgRef,
}: ForceGraphProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const simulationRef = useRef<d3.Simulation<GraphNode, GraphLink> | null>(null);
  const lastClickRef = useRef<{ id: string; time: number }>({ id: '', time: 0 });
  const transformRef = useRef<d3.ZoomTransform>(d3.zoomIdentity);
  const gRef = useRef<d3.Selection<SVGGElement, unknown, null, undefined> | null>(null);
  const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const nodesRef = useRef<GraphNode[]>([]);
  const linksRef = useRef<GraphLink[]>([]);
  const viewportRef = useRef<{ width: number; height: number }>({ width: 0, height: 0 });
  const onClickRef = useRef(onEntityClick);
  const onDoubleClickRef = useRef(onEntityDoubleClick);
  const onHoverRef = useRef(onEntityHover);
  const searchMatchIdsRef = useRef<Set<string>>(new Set());

  const [loadingProgress, setLoadingProgress] = useState(0);
  const [isLoadingIncremental, setIsLoadingIncremental] = useState(false);
  const [renderedCount, setRenderedCount] = useState(INCREMENTAL_BATCH_SIZE);
  const [exportPhase, setExportPhase] = useState<string | null>(null);
  const [forceRenderAll, setForceRenderAll] = useState(false);

  useEffect(() => { onClickRef.current = onEntityClick; }, [onEntityClick]);
  useEffect(() => { onDoubleClickRef.current = onEntityDoubleClick; }, [onEntityDoubleClick]);
  useEffect(() => { onHoverRef.current = onEntityHover; }, [onEntityHover]);

  const filteredEntities = useMemo(
    () => entities.filter((e) => entityTypeFilter.includes(e.type)),
    [entities, entityTypeFilter]
  );

  const filteredEntityIds = useMemo(
    () => new Set(filteredEntities.map((e) => e.id)),
    [filteredEntities]
  );

  const filteredRelations = useMemo(
    () =>
      relations.filter(
        (r) => filteredEntityIds.has(r.sourceId) && filteredEntityIds.has(r.targetId)
      ),
    [relations, filteredEntityIds]
  );

  const sortedEntities = useMemo(() => {
    return [...filteredEntities].sort((a, b) => {
      const aPinned = pinnedEntityIds.has(a.id) ? 1 : 0;
      const bPinned = pinnedEntityIds.has(b.id) ? 1 : 0;
      if (aPinned !== bPinned) return bPinned - aPinned;
      return b.frequency - a.frequency;
    });
  }, [filteredEntities, pinnedEntityIds]);

  const useVirtualization = filteredEntities.length > VIRTUALIZATION_THRESHOLD;
  const useIncrementalLoading = filteredEntities.length > VIRTUALIZATION_THRESHOLD;

  const visibleEntities = useMemo<Entity[]>(() => {
    if (forceRenderAll) return sortedEntities;
    const topCount = useIncrementalLoading
      ? Math.min(renderedCount, sortedEntities.length)
      : sortedEntities.length;
    const topSet = new Set(sortedEntities.slice(0, topCount).map((e) => e.id));
    pinnedEntityIds.forEach((id) => topSet.add(id));
    return sortedEntities.filter((e) => topSet.has(e.id));
  }, [sortedEntities, renderedCount, useIncrementalLoading, pinnedEntityIds, forceRenderAll]);

  const visibleEntityIds = useMemo(
    () => new Set(visibleEntities.map((e) => e.id)),
    [visibleEntities]
  );

  const visibleRelations = useMemo(
    () =>
      filteredRelations.filter(
        (r) => visibleEntityIds.has(r.sourceId) && visibleEntityIds.has(r.targetId)
      ),
    [filteredRelations, visibleEntityIds]
  );

  const searchMatchIds = useMemo(() => {
    if (!searchQuery.trim()) return new Set<string>();
    const q = searchQuery.toLowerCase();
    return new Set(
      sortedEntities
        .filter((e) => e.name.toLowerCase().includes(q))
        .map((e) => e.id)
    );
  }, [sortedEntities, searchQuery]);

  useEffect(() => {
    searchMatchIdsRef.current = searchMatchIds;
  }, [searchMatchIds]);

  const effectiveCount = useIncrementalLoading
    ? Math.min(renderedCount, sortedEntities.length)
    : sortedEntities.length;

  useEffect(() => {
    if (!useIncrementalLoading || forceRenderAll) return;
    if (renderedCount >= sortedEntities.length) {
      setIsLoadingIncremental(false);
      return;
    }
    setIsLoadingIncremental(true);
    let current = renderedCount;
    const total = sortedEntities.length;
    const loadBatch = () => {
      const next = Math.min(current + INCREMENTAL_BATCH_SIZE, total);
      setRenderedCount(next);
      setLoadingProgress(Math.round((next / total) * 100));
      current = next;
      if (current < total) {
        requestAnimationFrame(loadBatch);
      } else {
        setIsLoadingIncremental(false);
      }
    };
    requestAnimationFrame(loadBatch);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [useIncrementalLoading, sortedEntities.length, forceRenderAll]);

  useEffect(() => {
    if (forceRenderAll) return;
    setRenderedCount(
      useIncrementalLoading ? Math.min(INCREMENTAL_BATCH_SIZE, sortedEntities.length) : sortedEntities.length
    );
  }, [sortedEntities, useIncrementalLoading, forceRenderAll]);

  const ensureAllRendered = useCallback(async () => {
    setForceRenderAll(true);
    return new Promise<void>((resolve) => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            resolve();
          });
        });
      });
    });
  }, []);

  const finishExport = useCallback(() => {
    setForceRenderAll(false);
  }, []);

  const { exportPng, exportSvg } = useForceGraphExport({
    svgRef,
    simulationRef,
    gRef,
    zoomRef,
    nodesRef,
    viewportRef,
    ensureAllRendered,
  });

  useEffect(() => {
    exportPngRef.current = () => {
      setExportPhase('正在准备导出…');
      void exportPng(
        ({ phase, progress }) => {
          const msg: Record<string, string> = {
            'export:preparing': '准备画布…',
            'export:stabilizing': `稳定布局…${progress}%`,
            'export:rendering': `渲染图片…${progress}%`,
            'export:done': '导出完成',
          };
          setExportPhase(msg[phase] ?? null);
        },
        () => {
          finishExport();
          setTimeout(() => setExportPhase(null), 400);
        }
      );
    };
    exportSvgRef.current = () => {
      setExportPhase('正在准备导出…');
      void exportSvg(
        ({ phase, progress }) => {
          const msg: Record<string, string> = {
            'export:preparing': '准备画布…',
            'export:stabilizing': `稳定布局…${progress}%`,
            'export:rendering': `渲染 SVG…${progress}%`,
            'export:done': '导出完成',
          };
          setExportPhase(msg[phase] ?? null);
        },
        () => {
          finishExport();
          setTimeout(() => setExportPhase(null), 400);
        }
      );
    };
  }, [exportPng, exportSvg, exportPngRef, exportSvgRef, finishExport]);

  const buildGraph = useCallback(() => {
    const svgEl = svgRef.current;
    const container = containerRef.current;
    if (!svgEl || !container) return;

    const svg = d3.select(svgEl);
    svg.selectAll('*').remove();

    const width = container.clientWidth;
    const height = container.clientHeight;
    viewportRef.current = { width, height };
    svg.attr('width', width).attr('height', height);

    const defs = svg.append('defs');

    (['citation', 'dependency'] as RelationType[]).forEach((rt) => {
      defs.append('marker')
        .attr('id', `arrow-${rt}`)
        .attr('viewBox', '0 -5 10 10')
        .attr('refX', 20)
        .attr('refY', 0)
        .attr('markerWidth', 6)
        .attr('markerHeight', 6)
        .attr('orient', 'auto')
        .append('path')
        .attr('d', 'M0,-5L10,0L0,5')
        .attr('fill', RELATION_COLORS[rt]);
    });

    const glowFilter = defs.append('filter').attr('id', 'glow');
    glowFilter.append('feGaussianBlur').attr('stdDeviation', '3').attr('result', 'coloredBlur');
    const feMerge = glowFilter.append('feMerge');
    feMerge.append('feMergeNode').attr('in', 'coloredBlur');
    feMerge.append('feMergeNode').attr('in', 'SourceGraphic');

    const g = svg.append('g').attr('class', 'graph-container');
    gRef.current = g;

    g.append('g').attr('class', 'links');
    g.append('g').attr('class', 'link-labels');
    g.append('g').attr('class', 'nodes');
    g.append('g').attr('class', 'labels');

    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 4])
      .on('zoom', (event) => {
        transformRef.current = event.transform;
        g.attr('transform', event.transform);
      });
    svg.call(zoom);
    svg.on('dblclick.zoom', null);
    zoomRef.current = zoom;

    const simulation = d3.forceSimulation<GraphNode>([])
      .force('link', d3.forceLink<GraphNode, GraphLink>().id((d) => d.id).distance(FORCE_LINK_DISTANCE).strength(0.1))
      .force('charge', d3.forceManyBody().strength(FORCE_CHARGE_STRENGTH))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide().radius((d) => getNodeRadius((d as GraphNode).frequency) + 5))
      .force('x', d3.forceX(width / 2).strength(0.03))
      .force('y', d3.forceY(height / 2).strength(0.03))
      .on('tick', () => {
        g.select('.links').selectAll<SVGLineElement, GraphLink>('line')
          .attr('x1', (d) => (d.source as GraphNode).x!)
          .attr('y1', (d) => (d.source as GraphNode).y!)
          .attr('x2', (d) => (d.target as GraphNode).x!)
          .attr('y2', (d) => (d.target as GraphNode).y!);
        g.select('.link-labels').selectAll<SVGTextElement, GraphLink>('text')
          .attr('x', (d) => ((d.source as GraphNode).x! + (d.target as GraphNode).x!) / 2)
          .attr('y', (d) => ((d.source as GraphNode).y! + (d.target as GraphNode).y!) / 2);
        g.select('.nodes').selectAll<SVGCircleElement, GraphNode>('circle')
          .attr('cx', (d) => d.x!)
          .attr('cy', (d) => d.y!);
        g.select('.labels').selectAll<SVGTextElement, GraphNode>('text')
          .attr('x', (d) => d.x!)
          .attr('y', (d) => d.y!);
      });
    simulationRef.current = simulation;

    const existingTooltip = d3.select(container).select('.kg-tooltip');
    if (existingTooltip.empty()) {
      d3.select(container)
        .append('div')
        .attr('class', 'kg-tooltip')
        .style('position', 'absolute')
        .style('padding', '10px 14px')
        .style('background', 'rgba(15, 23, 42, 0.92)')
        .style('color', '#f1f5f9')
        .style('border-radius', '10px')
        .style('font-size', '12px')
        .style('line-height', '1.6')
        .style('pointer-events', 'none')
        .style('opacity', 0)
        .style('transition', 'opacity 0.15s')
        .style('z-index', '100')
        .style('max-width', '300px')
        .style('box-shadow', '0 4px 20px rgba(0,0,0,0.3)');
    }

    const resizeObserver = new ResizeObserver(() => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      viewportRef.current = { width: w, height: h };
      svg.attr('width', w).attr('height', h);
      simulation.force('center', d3.forceCenter(w / 2, h / 2));
      simulation.force('x', d3.forceX(w / 2).strength(0.03));
      simulation.force('y', d3.forceY(h / 2).strength(0.03));
      simulation.alpha(0.3).restart();
    });
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      simulation.stop();
    };
  }, []);

  useEffect(() => {
    const cleanup = buildGraph();
    return () => {
      cleanup?.();
      simulationRef.current?.stop();
      gRef.current = null;
      zoomRef.current = null;
    };
  }, [buildGraph]);

  useEffect(() => {
    const simulation = simulationRef.current;
    const g = gRef.current;
    const container = containerRef.current;
    if (!simulation || !g || !container) return;

    const existingNodeMap = new Map(nodesRef.current.map((n) => [n.id, n]));
    const newNodes: GraphNode[] = visibleEntities.map((e) => {
      const existing = existingNodeMap.get(e.id);
      if (existing) {
        existing.name = e.name;
        existing.type = e.type;
        existing.frequency = e.frequency;
        existing.sentiment = e.sentiment;
        existing.summary = e.summary;
        existing.paragraphIds = e.paragraphIds;
        existing.docIds = e.docIds;
        return existing;
      }
      return {
        id: e.id,
        name: e.name,
        type: e.type,
        frequency: e.frequency,
        sentiment: e.sentiment,
        summary: e.summary,
        paragraphIds: e.paragraphIds,
        docIds: e.docIds,
      } as GraphNode;
    });

    const existingLinkMap = new Map(linksRef.current.map((l) => [l.id, l]));
    const newLinks: GraphLink[] = visibleRelations.map((r) => {
      const existing = existingLinkMap.get(r.id);
      if (existing) return existing;
      return {
        id: r.id,
        source: r.sourceId,
        target: r.targetId,
        relationType: r.type,
        weight: r.weight,
        evidence: r.evidence,
      } as GraphLink;
    });

    nodesRef.current = newNodes;
    linksRef.current = newLinks;
    simulation.nodes(newNodes);
    (simulation.force('link') as d3.ForceLink<GraphNode, GraphLink>).links(newLinks);
    simulation.alpha(0.35).restart();

    const linkSel = g.select('.links')
      .selectAll<SVGLineElement, GraphLink>('line')
      .data(newLinks, (d) => d.id);
    linkSel.exit().remove();
    const linkEnter = linkSel.enter()
      .append('line')
      .attr('stroke', (d) => RELATION_COLORS[d.relationType])
      .attr('stroke-width', (d) => Math.max(1, d.weight))
      .attr('stroke-opacity', 0.4)
      .attr('marker-end', (d) =>
        d.relationType === 'citation' || d.relationType === 'dependency'
          ? `url(#arrow-${d.relationType})`
          : null
      );
    linkEnter.merge(linkSel)
      .attr('stroke', (d) => RELATION_COLORS[d.relationType])
      .attr('stroke-width', (d) => Math.max(1, d.weight));

    const linkLabelSel = g.select('.link-labels')
      .selectAll<SVGTextElement, GraphLink>('text')
      .data(newLinks.filter((l) => l.relationType !== 'cooccurrence'), (d) => d.id);
    linkLabelSel.exit().remove();
    linkLabelSel.enter()
      .append('text')
      .text((d) => RELATION_LABELS[d.relationType])
      .attr('font-size', 8)
      .attr('fill', (d) => RELATION_COLORS[d.relationType])
      .attr('text-anchor', 'middle')
      .attr('dy', -6)
      .attr('pointer-events', 'none')
      .style('user-select', 'none')
      .attr('opacity', 0.7);

    const tooltip = d3.select(container).select('.kg-tooltip');

    const dragBehavior = d3.drag<SVGCircleElement, GraphNode>()
      .on('start', (event, d) => {
        if (!event.active) simulation.alphaTarget(0.3).restart();
        d.fx = d.x;
        d.fy = d.y;
      })
      .on('drag', (event, d) => {
        d.fx = event.x;
        d.fy = event.y;
      })
      .on('end', (event, d) => {
        if (!event.active) simulation.alphaTarget(0);
        d.fx = null;
        d.fy = null;
      });

    const nodeSel = g.select('.nodes')
      .selectAll<SVGCircleElement, GraphNode>('circle')
      .data(newNodes, (d) => d.id);
    nodeSel.exit().remove();
    const nodeEnter = nodeSel.enter()
      .append('circle')
      .attr('r', (d) => getNodeRadius(d.frequency))
      .attr('fill', (d) => ENTITY_COLORS[d.type])
      .attr('stroke', '#fff')
      .attr('stroke-width', 2)
      .attr('cursor', 'pointer')
      .call(dragBehavior);

    nodeEnter
      .on('mouseover', (_event, d) => {
        onHoverRef.current?.(d.id);
        if (!tooltip.empty()) {
          tooltip
            .style('opacity', 1)
            .html(`
              <div style="font-weight:600;margin-bottom:4px;font-size:13px;">${d.name}</div>
              <div style="color:${ENTITY_COLORS[d.type]};font-size:11px;margin-bottom:3px;">${ENTITY_LABELS[d.type]}</div>
              <div style="font-size:11px;opacity:0.85;">${d.summary}</div>
              <div style="font-size:10px;opacity:0.65;margin-top:4px;border-top:1px solid rgba(255,255,255,0.15);padding-top:4px;">
                频次：${d.frequency} · 文档：${d.docIds.length} · 段落：${d.paragraphIds.length}
              </div>
            `);
        }
      })
      .on('mousemove', (event) => {
        if (!tooltip.empty() && containerRef.current) {
          const rect = containerRef.current.getBoundingClientRect();
          let left = event.clientX - rect.left + 14;
          let top = event.clientY - rect.top - 14;
          if (left + 300 > rect.width) left = event.clientX - rect.left - 310;
          if (top < 0) top = event.clientY - rect.top + 14;
          tooltip.style('left', `${left}px`).style('top', `${top}px`);
        }
      })
      .on('mouseout', () => {
        onHoverRef.current?.(null);
        if (!tooltip.empty()) tooltip.style('opacity', 0);
      })
      .on('click', (_event, d) => {
        const now = Date.now();
        const last = lastClickRef.current;
        if (last.id === d.id && now - last.time < 350) {
          onDoubleClickRef.current?.(d.id);
          lastClickRef.current = { id: '', time: 0 };
        } else {
          lastClickRef.current = { id: d.id, time: now };
          onClickRef.current?.(d.id);
        }
      });

    nodeEnter.merge(nodeSel)
      .attr('r', (d) => getNodeRadius(d.frequency))
      .attr('fill', (d) => ENTITY_COLORS[d.type]);

    const labelSel = g.select('.labels')
      .selectAll<SVGTextElement, GraphNode>('text')
      .data(newNodes, (d) => d.id);
    labelSel.exit().remove();
    labelSel.enter()
      .append('text')
      .text((d) => (d.name.length > 6 ? d.name.slice(0, 6) + '…' : d.name))
      .attr('font-size', 10)
      .attr('fill', '#334155')
      .attr('text-anchor', 'middle')
      .attr('dy', (d) => getNodeRadius(d.frequency) + 14)
      .attr('pointer-events', 'none')
      .style('user-select', 'none');
  }, [visibleEntities, visibleRelations]);

  useEffect(() => {
    const g = gRef.current;
    if (!g) return;
    const activeId = selectedEntityId || hoveredEntityId;

    const nodeSel = g.select('.nodes').selectAll<SVGCircleElement, GraphNode>('circle');
    const linkSel = g.select('.links').selectAll<SVGLineElement, GraphLink>('line');
    const labelSel = g.select('.labels').selectAll<SVGTextElement, GraphNode>('text');
    const linkLabelSel = g.select('.link-labels').selectAll<SVGTextElement, GraphLink>('text');

    if (activeId) {
      const connected = new Set<string>([activeId]);
      for (const link of linksRef.current) {
        const s = (link.source as GraphNode).id;
        const t = (link.target as GraphNode).id;
        if (s === activeId || t === activeId) {
          connected.add(s);
          connected.add(t);
        }
      }
      nodeSel.transition().duration(200)
        .attr('opacity', (d) => (connected.has(d.id) ? 1 : 0.12))
        .attr('stroke-width', (d) => (d.id === activeId ? 4 : 2))
        .attr('stroke', (d) => (d.id === activeId ? '#fbbf24' : '#fff'))
        .attr('filter', (d) => (d.id === activeId ? 'url(#glow)' : null));
      linkSel.transition().duration(200)
        .attr('stroke-opacity', (d) => {
          const s = (d.source as GraphNode).id;
          const t = (d.target as GraphNode).id;
          return s === activeId || t === activeId ? 0.8 : 0.04;
        })
        .attr('stroke-width', (d) => {
          const s = (d.source as GraphNode).id;
          const t = (d.target as GraphNode).id;
          return s === activeId || t === activeId
            ? Math.max(2.5, d.weight * 1.5)
            : Math.max(0.5, d.weight * 0.5);
        });
      labelSel.transition().duration(200)
        .attr('opacity', (d) => (connected.has(d.id) ? 1 : 0.08));
      linkLabelSel.transition().duration(200)
        .attr('opacity', (d) => {
          const s = (d.source as GraphNode).id;
          const t = (d.target as GraphNode).id;
          return s === activeId || t === activeId ? 0.9 : 0.05;
        });
    } else {
      const sm = searchMatchIdsRef.current;
      const hasSearch = sm && sm.size > 0;
      nodeSel.transition().duration(200)
        .attr('opacity', (d) => (hasSearch ? (sm.has(d.id) ? 1 : 0.25) : 1))
        .attr('stroke-width', 2)
        .attr('stroke', '#fff')
        .attr('filter', null);
      linkSel.transition().duration(200)
        .attr('stroke-opacity', hasSearch ? 0.15 : 0.4)
        .attr('stroke-width', (d) => Math.max(1, d.weight));
      labelSel.transition().duration(200)
        .attr('opacity', (d) => (hasSearch ? (sm.has(d.id) ? 1 : 0.15) : 1));
      linkLabelSel.transition().duration(200)
        .attr('opacity', hasSearch ? 0.1 : 0.7);
    }
  }, [selectedEntityId, hoveredEntityId, searchMatchIds]);

  useEffect(() => {
    if (!searchMatchIds.size) return;
    const svgEl = svgRef.current;
    const zoom = zoomRef.current;
    if (!svgEl || !zoom) return;

    let attempts = 0;
    const maxAttempts = 30;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const attempt = () => {
      attempts++;
      const target = nodesRef.current.find((n) => searchMatchIds.has(n.id));
      if (!target || target.x === undefined || target.y === undefined || isNaN(target.x) || isNaN(target.y)) {
        if (attempts < maxAttempts) {
          timer = setTimeout(attempt, 50);
        }
        return;
      }
      const vp = viewportRef.current;
      if (vp.width <= 0 || vp.height <= 0) {
        if (attempts < maxAttempts) {
          timer = setTimeout(attempt, 50);
        }
        return;
      }
      const targetK = 1.2;
      const targetX = vp.width / 2 - target.x * targetK;
      const targetY = vp.height / 2 - target.y * targetK;
      d3.select(svgEl).transition().duration(750).ease(d3.easeCubicOut)
        .call(zoom.transform, d3.zoomIdentity.translate(targetX, targetY).scale(targetK));
    };
    attempt();

    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [searchMatchIds]);

  const getMinimapNodes = () =>
    nodesRef.current
      .filter((n) => n.x !== undefined && n.y !== undefined && isFinite(n.x) && isFinite(n.y))
      .map((n) => ({ id: n.id, type: n.type, x: n.x!, y: n.y! }));

  const getViewport = () => {
    const vp = viewportRef.current;
    if (vp.width <= 0) return null;
    return { x: transformRef.current.x, y: transformRef.current.y, k: transformRef.current.k, vpWidth: vp.width, vpHeight: vp.height };
  };

  return (
    <div ref={containerRef} className="relative h-full w-full overflow-hidden bg-slate-50">
      <svg ref={svgRef} className="h-full w-full" />

      {isLoadingIncremental && !forceRenderAll && (
        <div className="pointer-events-none absolute top-4 left-1/2 -translate-x-1/2 rounded-full bg-white/90 px-4 py-2 text-xs text-slate-600 shadow-lg backdrop-blur-sm">
          正在加载节点… {loadingProgress}% ({effectiveCount}/{sortedEntities.length})
        </div>
      )}

      {exportPhase && (
        <div className="pointer-events-none absolute top-4 left-1/2 -translate-x-1/2 animate-pulse rounded-full bg-[#1e3a5f] px-4 py-2 text-xs font-medium text-white shadow-lg">
          {exportPhase}
        </div>
      )}

      {useVirtualization && !forceRenderAll && (
        <div className="pointer-events-none absolute top-4 right-4 rounded-full bg-slate-100/80 px-3 py-1 text-[10px] text-slate-500 backdrop-blur-sm">
          虚拟化 · {visibleEntities.length} 个节点
        </div>
      )}

      <GraphLegend />

      <div className="absolute bottom-16 left-4">
        <GraphMinimap getNodes={getMinimapNodes} getViewport={getViewport} />
      </div>
    </div>
  );
}
