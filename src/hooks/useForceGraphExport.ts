import { useCallback, useRef } from 'react';
import * as d3 from 'd3';
import { EXPORT_TICKS_TO_STABILIZE } from '../utils/graphConstants';
import { computeGraphBoundingBox, getNodeRadius } from '../utils/graphUtils';
import type { EntityType, RelationType } from '../types';

export interface GraphNode extends d3.SimulationNodeDatum {
  id: string;
  name: string;
  type: EntityType;
  frequency: number;
  sentiment: string;
  summary: string;
  paragraphIds: string[];
  docIds: string[];
}

export interface GraphLink extends d3.SimulationLinkDatum<GraphNode> {
  id: string;
  relationType: RelationType;
  weight: number;
  evidence: string[];
}

interface ExportHooksInput {
  svgRef: React.MutableRefObject<SVGSVGElement | null>;
  simulationRef: React.MutableRefObject<d3.Simulation<GraphNode, GraphLink> | null>;
  gRef: React.MutableRefObject<d3.Selection<SVGGElement, unknown, null, undefined> | null>;
  zoomRef: React.MutableRefObject<d3.ZoomBehavior<SVGSVGElement, unknown> | null>;
  nodesRef: React.MutableRefObject<GraphNode[]>;
  viewportRef: React.MutableRefObject<{ width: number; height: number }>;
  ensureAllRendered: () => Promise<void>;
}

interface ProgressEvent {
  phase: 'export:preparing' | 'export:stabilizing' | 'export:rendering' | 'export:done';
  progress: number;
}

export function useForceGraphExport({
  svgRef,
  simulationRef,
  gRef,
  zoomRef,
  nodesRef,
  viewportRef,
  ensureAllRendered,
}: ExportHooksInput) {
  const inProgressRef = useRef(false);

  const prepareForExport = useCallback(async (onProgress?: (e: ProgressEvent) => void) => {
    if (inProgressRef.current) return null;
    inProgressRef.current = true;
    try {
      onProgress?.({ phase: 'export:preparing', progress: 5 });
      await ensureAllRendered();

      onProgress?.({ phase: 'export:stabilizing', progress: 20 });
      const sim = simulationRef.current;
      if (!sim) return null;

      sim.stop();
      sim.alpha(1).alphaDecay(0.0228).restart();
      for (let i = 0; i < EXPORT_TICKS_TO_STABILIZE; i++) {
        sim.tick();
        if (i % 50 === 0) {
          onProgress?.({
            phase: 'export:stabilizing',
            progress: 20 + Math.round(i / EXPORT_TICKS_TO_STABILIZE * 60),
          });
        }
      }
      sim.stop();

      onProgress?.({ phase: 'export:rendering', progress: 85 });
      const nodes = nodesRef.current;
      const bbox = computeGraphBoundingBox(nodes);
      const pad = Math.max(40, getNodeRadius(nodes.reduce((m, n) => Math.max(m, n.frequency), 0)) * 2 + 20);
      const vp = viewportRef.current;
      const rangeX = bbox.maxX - bbox.minX || 1;
      const rangeY = bbox.maxY - bbox.minY || 1;
      const scaleK = Math.min(
        (vp.width - pad * 2) / rangeX,
        (vp.height - pad * 2) / rangeY,
        2
      );
      const scale = Math.max(0.25, Math.min(scaleK, 3));
      const tx = vp.width / 2 - (bbox.minX + rangeX / 2) * scale;
      const ty = vp.height / 2 - (bbox.minY + rangeY / 2) * scale;
      const transform = d3.zoomIdentity.translate(tx, ty).scale(scale);

      const svg = svgRef.current;
      if (!svg) return null;
      const g = gRef.current;
      if (!g) return null;

      const prevTransform = (svg as SVGSVGElement & { __prevTransform?: d3.ZoomTransform }).__prevTransform || d3.zoomIdentity;
      (svg as SVGSVGElement & { __prevTransform: d3.ZoomTransform }).__prevTransform = prevTransform;

      g.attr('transform', transform.toString());

      onProgress?.({ phase: 'export:rendering', progress: 95 });

      return {
        async restore() {
          g.attr('transform', prevTransform.toString());
          sim.alpha(0.15).restart();
          if (svg && zoomRef.current) {
            d3.select(svg).call(zoomRef.current.transform, prevTransform);
          }
          inProgressRef.current = false;
          onProgress?.({ phase: 'export:done', progress: 100 });
        },
      };
    } catch (err) {
      inProgressRef.current = false;
      throw err;
    }
  }, [svgRef, simulationRef, gRef, zoomRef, nodesRef, viewportRef, ensureAllRendered]);

  const exportPng = useCallback(
    async (
      onProgress?: (e: ProgressEvent) => void,
      onComplete?: () => void
    ) => {
      const state = await prepareForExport(onProgress);
      if (!state) return;
      const el = svgRef.current;
      try {
        if (!el) return;
        const scale = 2;
        const w = el.clientWidth;
        const h = el.clientHeight;

        const clone = el.cloneNode(true) as SVGSVGElement;
        clone.setAttribute('width', String(w));
        clone.setAttribute('height', String(h));
        clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
        clone.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');

        const serializer = new XMLSerializer();
        const svgString = serializer.serializeToString(clone);
        const svg64 = btoa(unescape(encodeURIComponent(svgString)));
        const dataUrl = 'data:image/svg+xml;base64,' + svg64;

        const canvas = document.createElement('canvas');
        canvas.width = w * scale;
        canvas.height = h * scale;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.scale(scale, scale);

        const img = new Image();
        img.onload = () => {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0);
          const a = document.createElement('a');
          a.download = `knowledge-graph-${Date.now()}.png`;
          a.href = canvas.toDataURL('image/png');
          a.click();
          state.restore().then(() => onComplete?.());
        };
        img.onerror = () => {
          state.restore().then(() => onComplete?.());
        };
        img.src = dataUrl;
      } catch {
        await state.restore();
      }
    },
    [svgRef, prepareForExport]
  );

  const exportSvg = useCallback(
    async (
      onProgress?: (e: ProgressEvent) => void,
      onComplete?: () => void
    ) => {
      const state = await prepareForExport(onProgress);
      if (!state) return;
      const el = svgRef.current;
      try {
        if (!el) return;
        const clone = el.cloneNode(true) as SVGSVGElement;
        clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
        clone.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
        const serializer = new XMLSerializer();
        const src = serializer.serializeToString(clone);
        const doctype =
          '<?xml version="1.0" encoding="UTF-8" standalone="no"?>\n' +
          '<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">\n';
        const blob = new Blob([doctype + src], { type: 'image/svg+xml' });
        const a = document.createElement('a');
        a.download = `knowledge-graph-${Date.now()}.svg`;
        a.href = URL.createObjectURL(blob);
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      } finally {
        await state.restore();
        onComplete?.();
      }
    },
    [svgRef, prepareForExport]
  );

  return { exportPng, exportSvg };
}
