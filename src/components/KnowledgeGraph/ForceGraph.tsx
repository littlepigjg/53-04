import { useEffect, useRef, useCallback, useMemo, useState } from 'react';
import * as d3 from 'd3';
import type { Entity, Relation, EntityType, RelationType } from '../../types';

interface GraphNode extends d3.SimulationNodeDatum {
  id: string;
  name: string;
  type: EntityType;
  frequency: number;
  sentiment: string;
  summary: string;
  paragraphIds: string[];
  docIds: string[];
}

interface GraphLink extends d3.SimulationLinkDatum<GraphNode> {
  id: string;
  relationType: RelationType;
  weight: number;
  evidence: string[];
}

interface ForceGraphProps {
  entities: Entity[];
  relations: Relation[];
  selectedEntityId: string | null;
  hoveredEntityId: string | null;
  entityTypeFilter: EntityType[];
  searchQuery: string;
  onEntityClick: (entityId: string) => void;
  onEntityDoubleClick: (entityId: string) => void;
  onEntityHover: (entityId: string | null) => void;
  exportPngRef: React.MutableRefObject<(() => void) | null>;
  exportSvgRef: React.MutableRefObject<(() => void) | null>;
}

const ENTITY_COLORS: Record<EntityType, string> = {
  person: '#3b82f6',
  location: '#10b981',
  organization: '#8b5cf6',
  term: '#f59e0b',
};

const RELATION_COLORS: Record<RelationType, string> = {
  citation: '#ef4444',
  dependency: '#3b82f6',
  comparison: '#f59e0b',
  cooccurrence: '#94a3b8',
};

const ENTITY_LABELS: Record<EntityType, string> = {
  person: '人物',
  location: '地点',
  organization: '组织',
  term: '术语',
};

const RELATION_LABELS: Record<RelationType, string> = {
  citation: '引用',
  dependency: '依赖',
  comparison: '对比',
  cooccurrence: '共现',
};

const VIRTUALIZATION_THRESHOLD = 200;
const INCREMENTAL_BATCH_SIZE = 50;

export function ForceGraph({
  entities,
  relations,
  selectedEntityId,
  hoveredEntityId,
  entityTypeFilter,
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
  const minimapSvgRef = useRef<SVGSVGElement>(null);
  const viewportRef = useRef<{ width: number; height: number }>({ width: 0, height: 0 });
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [isLoadingIncremental, setIsLoadingIncremental] = useState(false);
  const [renderedCount, setRenderedCount] = useState(INCREMENTAL_BATCH_SIZE);

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

  const sortedEntities = useMemo(
    () => [...filteredEntities].sort((a, b) => b.frequency - a.frequency),
    [filteredEntities]
  );

  const useVirtualization = filteredEntities.length > VIRTUALIZATION_THRESHOLD;
  const useIncrementalLoading = filteredEntities.length > VIRTUALIZATION_THRESHOLD;

  const effectiveCount = useIncrementalLoading
    ? Math.min(renderedCount, sortedEntities.length)
    : sortedEntities.length;

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
    if (!useIncrementalLoading) return;
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
  }, [useIncrementalLoading, sortedEntities.length]);

  useEffect(() => {
    setRenderedCount(
      useIncrementalLoading ? Math.min(INCREMENTAL_BATCH_SIZE, sortedEntities.length) : sortedEntities.length
    );
  }, [sortedEntities, useIncrementalLoading]);

  const initGraph = useCallback(() => {
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
        updateMinimap();
      });

    svg.call(zoom);
    svg.on('dblclick.zoom', null);
    zoomRef.current = zoom;

    const simulation = d3.forceSimulation<GraphNode>([])
      .force('link', d3.forceLink<GraphNode, GraphLink>().id((d) => d.id).distance(80).strength(0.1))
      .force('charge', d3.forceManyBody().strength(-200))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide().radius((d) => getNodeRadius(d as GraphNode) + 5))
      .force('x', d3.forceX(width / 2).strength(0.03))
      .force('y', d3.forceY(height / 2).strength(0.03))
      .on('tick', () => {
        g.select('.links').selectAll('line')
          .attr('x1', (d: unknown) => (d as GraphLink).source instanceof Object ? ((d as GraphLink).source as GraphNode).x! : 0)
          .attr('y1', (d: unknown) => (d as GraphLink).source instanceof Object ? ((d as GraphLink).source as GraphNode).y! : 0)
          .attr('x2', (d: unknown) => (d as GraphLink).target instanceof Object ? ((d as GraphLink).target as GraphNode).x! : 0)
          .attr('y2', (d: unknown) => (d as GraphLink).target instanceof Object ? ((d as GraphLink).target as GraphNode).y! : 0);

        g.select('.link-labels').selectAll('text')
          .attr('x', (d: unknown) => {
            const link = d as GraphLink;
            const sx = link.source instanceof Object ? (link.source as GraphNode).x! : 0;
            const tx = link.target instanceof Object ? (link.target as GraphNode).x! : 0;
            return (sx + tx) / 2;
          })
          .attr('y', (d: unknown) => {
            const link = d as GraphLink;
            const sy = link.source instanceof Object ? (link.source as GraphNode).y! : 0;
            const ty = link.target instanceof Object ? (link.target as GraphNode).y! : 0;
            return (sy + ty) / 2;
          });

        g.select('.nodes').selectAll('circle')
          .attr('cx', (d: unknown) => (d as GraphNode).x!)
          .attr('cy', (d: unknown) => (d as GraphNode).y!);

        g.select('.labels').selectAll('text')
          .attr('x', (d: unknown) => (d as GraphNode).x!)
          .attr('y', (d: unknown) => (d as GraphNode).y!);
      });

    simulationRef.current = simulation;

    let tooltip = d3.select(container).select('.kg-tooltip');
    if (tooltip.empty()) {
      tooltip = d3.select(container)
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

    exportPngRef.current = () => {
      const el = svgRef.current;
      if (!el) return;
      const svgData = new XMLSerializer().serializeToString(el);
      const canvas = document.createElement('canvas');
      const scale = 2;
      canvas.width = el.clientWidth * scale;
      canvas.height = el.clientHeight * scale;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.scale(scale, scale);
      const img = new Image();
      img.onload = () => {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);
        const a = document.createElement('a');
        a.download = 'knowledge-graph.png';
        a.href = canvas.toDataURL('image/png');
        a.click();
      };
      img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
    };

    exportSvgRef.current = () => {
      const el = svgRef.current;
      if (!el) return;
      const svgData = new XMLSerializer().serializeToString(el);
      const blob = new Blob([svgData], { type: 'image/svg+xml' });
      const a = document.createElement('a');
      a.download = 'knowledge-graph.svg';
      a.href = URL.createObjectURL(blob);
      a.click();
      URL.revokeObjectURL(a.href);
    };

    return () => {
      resizeObserver.disconnect();
      simulation.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const cleanup = initGraph();
    return () => {
      cleanup?.();
      simulationRef.current?.stop();
      gRef.current = null;
      zoomRef.current = null;
    };
  }, [initGraph]);

  useEffect(() => {
    const simulation = simulationRef.current;
    const g = gRef.current;
    if (!simulation || !g || sortedEntities.length === 0) return;

    const currentNodes = sortedEntities.slice(0, effectiveCount);
    const currentEntityIds = new Set(currentNodes.map((e) => e.id));
    const currentLinks = filteredRelations.filter(
      (r) => currentEntityIds.has(r.sourceId) && currentEntityIds.has(r.targetId)
    );

    const existingNodeMap = new Map(nodesRef.current.map((n) => [n.id, n]));
    const newNodes: GraphNode[] = currentNodes.map((e) => {
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
    const newLinks: GraphLink[] = currentLinks.map((r) => {
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
    simulation.alpha(0.4).restart();

    const linkElements = g.select('.links')
      .selectAll('line')
      .data(newLinks, (d: unknown) => (d as GraphLink).id);

    linkElements.exit().remove();

    const linkEnter = linkElements.enter()
      .append('line')
      .attr('stroke', (d: unknown) => RELATION_COLORS[(d as GraphLink).relationType])
      .attr('stroke-width', (d: unknown) => Math.max(1, (d as GraphLink).weight))
      .attr('stroke-opacity', 0.4)
      .attr('marker-end', (d: unknown) => {
        const rt = (d as GraphLink).relationType;
        return rt === 'citation' || rt === 'dependency' ? `url(#arrow-${rt})` : null;
      });

    const allLinks = linkEnter.merge(
      linkElements as d3.Selection<SVGLineElement, GraphLink, SVGGElement, unknown>
    );

    allLinks.attr('stroke', (d: unknown) => RELATION_COLORS[(d as GraphLink).relationType])
      .attr('stroke-width', (d: unknown) => Math.max(1, (d as GraphLink).weight));

    const linkLabelElements = g.select('.link-labels')
      .selectAll('text')
      .data(
        newLinks.filter((l) => l.relationType !== 'cooccurrence'),
        (d: unknown) => (d as GraphLink).id
      );

    linkLabelElements.exit().remove();

    linkLabelElements.enter()
      .append('text')
      .text((d: unknown) => RELATION_LABELS[(d as GraphLink).relationType])
      .attr('font-size', 8)
      .attr('fill', (d: unknown) => RELATION_COLORS[(d as GraphLink).relationType])
      .attr('text-anchor', 'middle')
      .attr('dy', -6)
      .attr('pointer-events', 'none')
      .style('user-select', 'none')
      .attr('opacity', 0.7);

    const nodeElements = g.select('.nodes')
      .selectAll('circle')
      .data(newNodes, (d: unknown) => (d as GraphNode).id);

    nodeElements.exit().remove();

    const nodeEnter = nodeElements.enter()
      .append('circle')
      .attr('r', (d: unknown) => getNodeRadius(d as GraphNode))
      .attr('fill', (d: unknown) => ENTITY_COLORS[(d as GraphNode).type])
      .attr('stroke', '#fff')
      .attr('stroke-width', 2)
      .attr('cursor', 'pointer')
      .call(d3.drag<SVGCircleElement, GraphNode>()
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
        })
      );

    const tooltip = d3.select(containerRef.current!).select('.kg-tooltip');

    nodeEnter
      .on('mouseover', (event: MouseEvent, d: GraphNode) => {
        onEntityHover(d.id);
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
      .on('mousemove', (event: MouseEvent) => {
        if (!tooltip.empty()) {
          const rect = containerRef.current!.getBoundingClientRect();
          let left = event.clientX - rect.left + 14;
          let top = event.clientY - rect.top - 14;
          if (left + 300 > rect.width) left = event.clientX - rect.left - 310;
          if (top < 0) top = event.clientY - rect.top + 14;
          tooltip.style('left', `${left}px`).style('top', `${top}px`);
        }
      })
      .on('mouseout', () => {
        onEntityHover(null);
        if (!tooltip.empty()) tooltip.style('opacity', 0);
      })
      .on('click', (_event: MouseEvent, d: GraphNode) => {
        const now = Date.now();
        const last = lastClickRef.current;
        if (last.id === d.id && now - last.time < 350) {
          onEntityDoubleClick(d.id);
          lastClickRef.current = { id: '', time: 0 };
        } else {
          lastClickRef.current = { id: d.id, time: now };
          onEntityClick(d.id);
        }
      });

    const allNodes = nodeEnter.merge(
      nodeElements as d3.Selection<SVGCircleElement, GraphNode, SVGGElement, unknown>
    );

    allNodes
      .attr('r', (d: unknown) => getNodeRadius(d as GraphNode))
      .attr('fill', (d: unknown) => ENTITY_COLORS[(d as GraphNode).type]);

    const labelElements = g.select('.labels')
      .selectAll('text')
      .data(newNodes, (d: unknown) => (d as GraphNode).id);

    labelElements.exit().remove();

    labelElements.enter()
      .append('text')
      .text((d: unknown) => {
        const name = (d as GraphNode).name;
        return name.length > 6 ? name.slice(0, 6) + '…' : name;
      })
      .attr('font-size', 10)
      .attr('fill', '#334155')
      .attr('text-anchor', 'middle')
      .attr('dy', (d: unknown) => getNodeRadius(d as GraphNode) + 14)
      .attr('pointer-events', 'none')
      .style('user-select', 'none');
  }, [sortedEntities, filteredRelations, effectiveCount, onEntityClick, onEntityDoubleClick, onEntityHover]);

  useEffect(() => {
    const g = gRef.current;
    if (!g) return;

    const activeId = selectedEntityId || hoveredEntityId;

    const nodeElements = g.select('.nodes').selectAll('circle');
    const linkElements = g.select('.links').selectAll('line');
    const labelElements = g.select('.labels').selectAll('text');
    const linkLabelElements = g.select('.link-labels').selectAll('text');

    if (activeId) {
      const connected = new Set<string>();
      connected.add(activeId);

      linksRef.current.forEach((link) => {
        const s = typeof link.source === 'string' ? link.source : (link.source as GraphNode).id;
        const t = typeof link.target === 'string' ? link.target : (link.target as GraphNode).id;
        if (s === activeId || t === activeId) {
          connected.add(s);
          connected.add(t);
        }
      });

      nodeElements
        .transition().duration(200)
        .attr('opacity', (d: unknown) => connected.has((d as GraphNode).id) ? 1 : 0.12)
        .attr('stroke-width', (d: unknown) => (d as GraphNode).id === activeId ? 4 : 2)
        .attr('stroke', (d: unknown) => (d as GraphNode).id === activeId ? '#fbbf24' : '#fff')
        .attr('filter', (d: unknown) => (d as GraphNode).id === activeId ? 'url(#glow)' : null);

      linkElements
        .transition().duration(200)
        .attr('stroke-opacity', (d: unknown) => {
          const link = d as GraphLink;
          const s = typeof link.source === 'string' ? link.source : (link.source as GraphNode).id;
          const t = typeof link.target === 'string' ? link.target : (link.target as GraphNode).id;
          return (s === activeId || t === activeId) ? 0.8 : 0.04;
        })
        .attr('stroke-width', (d: unknown) => {
          const link = d as GraphLink;
          const s = typeof link.source === 'string' ? link.source : (link.source as GraphNode).id;
          const t = typeof link.target === 'string' ? link.target : (link.target as GraphNode).id;
          return (s === activeId || t === activeId) ? Math.max(2.5, link.weight * 1.5) : Math.max(0.5, link.weight * 0.5);
        });

      labelElements
        .transition().duration(200)
        .attr('opacity', (d: unknown) => connected.has((d as GraphNode).id) ? 1 : 0.08);

      linkLabelElements
        .transition().duration(200)
        .attr('opacity', (d: unknown) => {
          const link = d as GraphLink;
          const s = typeof link.source === 'string' ? link.source : (link.source as GraphNode).id;
          const t = typeof link.target === 'string' ? link.target : (link.target as GraphNode).id;
          return (s === activeId || t === activeId) ? 0.9 : 0.05;
        });
    } else {
      nodeElements
        .transition().duration(200)
        .attr('opacity', (d: unknown) => {
          if (searchMatchIds.size > 0) {
            return searchMatchIds.has((d as GraphNode).id) ? 1 : 0.25;
          }
          return 1;
        })
        .attr('stroke-width', 2)
        .attr('stroke', '#fff')
        .attr('filter', null);

      linkElements
        .transition().duration(200)
        .attr('stroke-opacity', searchMatchIds.size > 0 ? 0.15 : 0.4)
        .attr('stroke-width', (d: unknown) => Math.max(1, (d as GraphLink).weight));

      labelElements
        .transition().duration(200)
        .attr('opacity', (d: unknown) => {
          if (searchMatchIds.size > 0) {
            return searchMatchIds.has((d as GraphNode).id) ? 1 : 0.15;
          }
          return 1;
        });

      linkLabelElements
        .transition().duration(200)
        .attr('opacity', searchMatchIds.size > 0 ? 0.1 : 0.7);
    }
  }, [selectedEntityId, hoveredEntityId, searchMatchIds]);

  const updateMinimap = useCallback(() => {
    const minimapEl = minimapSvgRef.current;
    const nodes = nodesRef.current;
    if (!minimapEl || nodes.length === 0) return;

    const svg = d3.select(minimapEl);
    const mw = 160;
    const mh = 100;

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const n of nodes) {
      if (n.x !== undefined && n.y !== undefined) {
        minX = Math.min(minX, n.x);
        maxX = Math.max(maxX, n.x);
        minY = Math.min(minY, n.y);
        maxY = Math.max(maxY, n.y);
      }
    }

    if (!isFinite(minX)) return;

    const pad = 50;
    minX -= pad; maxX += pad; minY -= pad; maxY += pad;
    const rangeX = maxX - minX || 1;
    const rangeY = maxY - minY || 1;
    const scale = Math.min(mw / rangeX, mh / rangeY);

    const dotData = nodes.map((n) => ({
      id: n.id,
      type: n.type,
      x: (n.x! - minX) * scale,
      y: (n.y! - minY) * scale,
    }));

    svg.attr('width', mw).attr('height', mh);
    svg.select('.minimap-dots').attr('transform', `translate(${(mw - rangeX * scale) / 2}, ${(mh - rangeY * scale) / 2})`);

    const dots = svg.select('.minimap-dots').selectAll('circle')
      .data(dotData, (d: unknown) => (d as { id: string }).id);

    dots.exit().remove();

    dots.enter()
      .append('circle')
      .attr('r', 1.5)
      .attr('fill', (d: unknown) => ENTITY_COLORS[(d as { type: EntityType }).type])
      .attr('opacity', 0.6)
      .each(function (d: unknown) {
        const data = d as { x: number; y: number };
        d3.select(this).attr('cx', data.x).attr('cy', data.y);
      });

    dots.attr('cx', (d: unknown) => (d as { x: number }).x)
      .attr('cy', (d: unknown) => (d as { y: number }).y);

    const t = transformRef.current;
    const vp = viewportRef.current;
    if (t && vp.width > 0) {
      const invK = 1 / t.k;
      const vx1 = (-t.x) * invK;
      const vy1 = (-t.y) * invK;
      const vx2 = (-t.x + vp.width) * invK;
      const vy2 = (-t.y + vp.height) * invK;

      const rvx1 = (vx1 - minX) * scale + (mw - rangeX * scale) / 2;
      const rvy1 = (vy1 - minY) * scale + (mh - rangeY * scale) / 2;
      const rvx2 = (vx2 - minX) * scale + (mw - rangeX * scale) / 2;
      const rvy2 = (vy2 - minY) * scale + (mh - rangeY * scale) / 2;

      svg.select('.minimap-viewport')
        .attr('x', rvx1)
        .attr('y', rvy1)
        .attr('width', rvx2 - rvx1)
        .attr('height', rvy2 - rvy1);
    }
  }, []);

  useEffect(() => {
    const minimapEl = minimapSvgRef.current;
    if (!minimapEl) return;

    const svg = d3.select(minimapEl);
    svg.selectAll('*').remove();
    svg.append('g').attr('class', 'minimap-dots');
    svg.append('rect')
      .attr('class', 'minimap-viewport')
      .attr('fill', 'rgba(59, 130, 246, 0.1)')
      .attr('stroke', '#3b82f6')
      .attr('stroke-width', 1)
      .attr('rx', 2);
  }, []);

  useEffect(() => {
    const interval = setInterval(updateMinimap, 500);
    return () => clearInterval(interval);
  }, [updateMinimap]);

  useEffect(() => {
    if (!searchMatchIds.size || !zoomRef.current || !svgRef.current || !containerRef.current) return;
    const matchNode = nodesRef.current.find((n) => searchMatchIds.has(n.id));
    if (!matchNode || matchNode.x === undefined || matchNode.y === undefined) return;

    const vp = viewportRef.current;
    const targetK = 1.2;
    const targetX = vp.width / 2 - matchNode.x * targetK;
    const targetY = vp.height / 2 - matchNode.y * targetK;

    d3.select(svgRef.current).transition().duration(600)
      .call(
        zoomRef.current.transform,
        d3.zoomIdentity.translate(targetX, targetY).scale(targetK)
      );
  }, [searchMatchIds]);

  return (
    <div ref={containerRef} className="relative h-full w-full overflow-hidden bg-slate-50">
      <svg ref={svgRef} className="h-full w-full" />
      {isLoadingIncremental && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 rounded-full bg-white/90 px-4 py-2 text-xs text-slate-600 shadow-lg backdrop-blur-sm">
          正在加载节点… {loadingProgress}% ({effectiveCount}/{sortedEntities.length})
        </div>
      )}
      {useVirtualization && (
        <div className="absolute top-4 right-4 rounded-full bg-slate-100/80 px-3 py-1 text-[10px] text-slate-500 backdrop-blur-sm">
          虚拟化模式 · {effectiveCount} 个节点
        </div>
      )}
      <div className="absolute bottom-4 left-4 flex flex-col gap-1.5">
        {(['person', 'location', 'organization', 'term'] as EntityType[]).map((type) => (
          <div key={type} className="flex items-center gap-1.5 text-xs text-slate-600">
            <span
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: ENTITY_COLORS[type] }}
            />
            {ENTITY_LABELS[type]}
          </div>
        ))}
      </div>
      <div className="absolute bottom-4 right-4 flex flex-col gap-1.5">
        {(['citation', 'dependency', 'comparison', 'cooccurrence'] as RelationType[]).map((type) => (
          <div key={type} className="flex items-center gap-1.5 text-xs text-slate-600">
            <span
              className="inline-block h-0.5 w-4"
              style={{ backgroundColor: RELATION_COLORS[type] }}
            />
            {RELATION_LABELS[type]}
          </div>
        ))}
      </div>
      <div className="absolute bottom-16 left-4 rounded-lg border border-slate-200 bg-white/90 p-2 shadow-sm backdrop-blur-sm">
        <div className="mb-1 text-[9px] font-medium text-slate-500">导航</div>
        <svg ref={minimapSvgRef} className="block" />
      </div>
    </div>
  );
}

function getNodeRadius(node: GraphNode): number {
  return Math.max(6, Math.min(20, 4 + Math.sqrt(node.frequency) * 3));
}
