import { Router } from 'express';
import { KnowledgeGraphService } from '../services/KnowledgeGraphService.js';

const router = Router();

router.get('/document/:docId', async (req, res, next) => {
  try {
    const graph = await KnowledgeGraphService.buildForDocument(req.params.docId);
    res.json(graph);
  } catch (e) {
    next(e);
  }
});

router.get('/all', async (_req, res, next) => {
  try {
    const graph = await KnowledgeGraphService.buildForAllDocuments();
    res.json(graph);
  } catch (e) {
    next(e);
  }
});

router.get('/stats/document/:docId', async (req, res, next) => {
  try {
    const graph = await KnowledgeGraphService.buildForDocument(req.params.docId);
    const stats = KnowledgeGraphService.computeStats(graph);
    res.json(stats);
  } catch (e) {
    next(e);
  }
});

router.get('/stats/all', async (_req, res, next) => {
  try {
    const graph = await KnowledgeGraphService.buildForAllDocuments();
    const stats = KnowledgeGraphService.computeStats(graph);
    res.json(stats);
  } catch (e) {
    next(e);
  }
});

router.get('/expand/:entityId', async (req, res, next) => {
  try {
    const depth = req.query.depth ? Number(req.query.depth) : 1;
    const graph = await KnowledgeGraphService.buildForAllDocuments();
    const expanded = await KnowledgeGraphService.getRelatedEntities(
      req.params.entityId,
      graph,
      depth
    );
    res.json(expanded);
  } catch (e) {
    next(e);
  }
});

router.post('/cache/clear', (_req, res) => {
  KnowledgeGraphService.clearCache();
  res.json({ ok: true });
});

export default router;
