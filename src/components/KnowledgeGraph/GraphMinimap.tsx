import { useEffect, useRef } from 'react';
import * as d3 from 'd3';
import { ENTITY_COLORS } from '../../utils/graphConstants';
import type { EntityType } from '../../types';

interface MinimapNode {
  id: string;
  type: EntityType;
  x: number;
  y: number;
}

interface GraphMinimapProps {
  width?: number;
  height?: number;
  getNodes: () => MinimapNode[];
  getViewport: () => { x: number; y: number; k: number; vpWidth: number; vpHeight: number } | null;
}

export function GraphMinimap({
  width = 160,
  height = 100,
  getNodes,
  getViewport,
}: GraphMinimapProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const intervalRef = useRef<number | null>(null);

  const render = () => {
    const svgEl = svgRef.current;
    if (!svgEl) return;
    const svg = d3.select(svgEl);

    const rawNodes = getNodes();
    if (rawNodes.length === 0) return;

    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const n of rawNodes) {
      if (!isFinite(n.x) || !isFinite(n.y)) continue;
      minX = Math.min(minX, n.x);
      maxX = Math.max(maxX, n.x);
      minY = Math.min(minY, n.y);
      maxY = Math.max(maxY, n.y);
    }
    if (!isFinite(minX)) return;

    const pad = 50;
    minX -= pad; maxX += pad; minY -= pad; maxY += pad;
    const rangeX = maxX - minX || 1;
    const rangeY = maxY - minY || 1;
    const scale = Math.min(width / rangeX, height / rangeY);
    const ox = (width - rangeX * scale) / 2;
    const oy = (height - rangeY * scale) / 2;

    const dotData = rawNodes.map((n) => ({
      id: n.id,
      type: n.type,
      x: ox + (n.x - minX) * scale,
      y: oy + (n.y - minY) * scale,
    }));

    svg.selectAll('.mm-dot')
      .data(dotData, (d: unknown) => (d as { id: string }).id)
      .join(
        (enter) => enter.append('circle')
          .attr('class', 'mm-dot')
          .attr('r', 1.5)
          .attr('fill', (d: unknown) => ENTITY_COLORS[(d as { type: EntityType }).type])
          .attr('opacity', 0.6)
          .attr('cx', (d: unknown) => (d as { x: number }).x)
          .attr('cy', (d: unknown) => (d as { y: number }).y),
        (update) => update
          .attr('cx', (d: unknown) => (d as { x: number }).x)
          .attr('cy', (d: unknown) => (d as { y: number }).y)
      );

    const vp = getViewport();
    if (vp && vp.vpWidth > 0) {
      const invK = 1 / vp.k;
      const vx1 = (-vp.x) * invK;
      const vy1 = (-vp.y) * invK;
      const vx2 = (-vp.x + vp.vpWidth) * invK;
      const vy2 = (-vp.y + vp.vpHeight) * invK;
      const rx1 = ox + (vx1 - minX) * scale;
      const ry1 = oy + (vy1 - minY) * scale;
      const rx2 = ox + (vx2 - minX) * scale;
      const ry2 = oy + (vy2 - minY) * scale;

      svg.selectAll('.mm-vp').data([0]).join('rect')
        .attr('class', 'mm-vp')
        .attr('fill', 'rgba(59, 130, 246, 0.1)')
        .attr('stroke', '#3b82f6')
        .attr('stroke-width', 1)
        .attr('rx', 2)
        .attr('x', rx1)
        .attr('y', ry1)
        .attr('width', Math.max(0, rx2 - rx1))
        .attr('height', Math.max(0, ry2 - ry1));
    }
  };

  useEffect(() => {
    const svgEl = svgRef.current;
    if (svgEl) {
      const svg = d3.select(svgEl);
      svg.selectAll('*').remove();
      svg.attr('width', width).attr('height', height);
    }
  }, [width, height]);

  useEffect(() => {
    const id = window.setInterval(render, 400);
    intervalRef.current = id;
    return () => {
      if (intervalRef.current != null) window.clearInterval(intervalRef.current);
    };
  });

  return (
    <div className="rounded-lg border border-slate-200 bg-white/90 p-2 shadow-sm backdrop-blur-sm">
      <div className="mb-1 text-[9px] font-medium text-slate-500">导航</div>
      <svg ref={svgRef} className="block" />
    </div>
  );
}
