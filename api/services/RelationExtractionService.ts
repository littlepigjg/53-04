import type { Entity, Paragraph, Relation, RelationType } from '../../shared/types.js';

interface Cooccurrence {
  entityA: string;
  entityB: string;
  count: number;
  paragraphs: string[];
  contexts: string[];
}

const CITATION_PATTERNS = [
  /(?:引用|参考|参见|引用了|参考了|参见|摘自|来源于|据|根据)[^\s]{0,5}[""「『]([^""」』]+)[""」』]/g,
  /(?:according\s+to|cited\s+in|referenced\s+in|based\s+on)\s+([^\s,.]+)/gi,
];

const DEPENDENCY_PATTERNS = [
  /(?:依赖|需要|基于|建立在|取决于|依赖于|建立在.*之上)[^\s]{0,5}([^，。；,.;\n]{2,20})/g,
  /(?:depends?\s+on|requires?|based\s+on|built\s+on|relies?\s+on)\s+([^\s,.]+)/gi,
];

const COMPARISON_PATTERNS = [
  /(?:相比|对比|比较|优于|劣于|不如|胜过|类似于|相当于|不同于|区别于|相较于|与.*相比)/g,
  /(?:compared\s+to|vs\.?|versus|superior\s+to|inferior\s+to|similar\s+to|different\s+from)/gi,
];

const COMPARISON_CONNECTORS = [
  '与', '和', '跟', '同', '及', '以及',
];

export class RelationExtractionService {
  static extractRelations(
    entities: Entity[],
    paragraphs: Paragraph[],
    docId: string
  ): Relation[] {
    const entityByName = new Map<string, Entity>();
    for (const e of entities) {
      entityByName.set(e.name, e);
    }

    const entityByParagraph = new Map<string, Entity[]>();
    for (const e of entities) {
      for (const pid of e.paragraphIds) {
        if (!entityByParagraph.has(pid)) entityByParagraph.set(pid, []);
        entityByParagraph.get(pid)!.push(e);
      }
    }

    const relations: Relation[] = [];
    const relationKeys = new Set<string>();

    const cooccurrences = RelationExtractionService.computeCooccurrences(
      entities,
      paragraphs,
      entityByParagraph
    );

    for (const co of cooccurrences) {
      const eA = entityByName.get(co.entityA);
      const eB = entityByName.get(co.entityB);
      if (!eA || !eB) continue;

      const relType = RelationExtractionService.determineRelationType(
        eA, eB, co.contexts, paragraphs
      );

      const key = `${relType}::${eA.id}::${eB.id}`;
      const reverseKey = `${relType}::${eB.id}::${eA.id}`;
      if (relationKeys.has(key) || relationKeys.has(reverseKey)) continue;
      relationKeys.add(key);

      relations.push({
        id: `rel_${relType}_${eA.id.slice(0, 8)}_${eB.id.slice(0, 8)}`,
        sourceId: eA.id,
        targetId: eB.id,
        type: relType,
        weight: Math.min(co.count / 2, 5),
        evidence: co.contexts.slice(0, 5),
      });
    }

    RelationExtractionService.extractPatternRelations(
      entities,
      paragraphs,
      entityByName,
      relationKeys,
      relations
    );

    return relations;
  }

  private static computeCooccurrences(
    entities: Entity[],
    paragraphs: Paragraph[],
    entityByParagraph: Map<string, Entity[]>
  ): Cooccurrence[] {
    const coMap = new Map<string, Cooccurrence>();

    for (const para of paragraphs) {
      const paraEntities = entityByParagraph.get(para.id) || [];
      if (paraEntities.length < 2) continue;

      for (let i = 0; i < paraEntities.length; i++) {
        for (let j = i + 1; j < paraEntities.length; j++) {
          const a = paraEntities[i];
          const b = paraEntities[j];
          const key = [a.name, b.name].sort().join('||');
          if (!coMap.has(key)) {
            coMap.set(key, {
              entityA: a.name,
              entityB: b.name,
              count: 0,
              paragraphs: [],
              contexts: [],
            });
          }
          const co = coMap.get(key)!;
          co.count++;
          if (!co.paragraphs.includes(para.id)) {
            co.paragraphs.push(para.id);
          }
          co.contexts.push(para.content.slice(0, 100));
        }
      }
    }

    return Array.from(coMap.values()).filter((co) => co.count >= 1);
  }

  private static determineRelationType(
    eA: Entity,
    eB: Entity,
    contexts: string[],
    _paragraphs: Paragraph[]
  ): RelationType {
    const allCtx = contexts.join(' ');

    for (const pattern of CITATION_PATTERNS) {
      const r = new RegExp(pattern.source, pattern.flags);
      if (r.test(allCtx)) return 'citation';
    }

    for (const pattern of DEPENDENCY_PATTERNS) {
      const r = new RegExp(pattern.source, pattern.flags);
      if (r.test(allCtx)) return 'dependency';
    }

    for (const pattern of COMPARISON_PATTERNS) {
      const r = new RegExp(pattern.source, pattern.flags);
      if (r.test(allCtx)) return 'comparison';
    }

    if (eA.type === 'term' && eB.type === 'term') {
      const sharedParagraphs = eA.paragraphIds.filter((p) =>
        eB.paragraphIds.includes(p)
      );
      if (sharedParagraphs.length > 0) return 'dependency';
    }

    if ((eA.type === 'person' && eB.type === 'organization') ||
        (eA.type === 'organization' && eB.type === 'person')) {
      return 'cooccurrence';
    }

    return 'cooccurrence';
  }

  private static extractPatternRelations(
    entities: Entity[],
    paragraphs: Paragraph[],
    entityByName: Map<string, Entity>,
    relationKeys: Set<string>,
    relations: Relation[]
  ): void {
    const entityNames = entities.map((e) => e.name);

    for (const para of paragraphs) {
      const text = para.content;
      if (!text) continue;

      for (const pattern of COMPARISON_PATTERNS) {
        const r = new RegExp(pattern.source, pattern.flags);
        let match: RegExpExecArray | null;
        while ((match = r.exec(text)) !== null) {
          const before = text.slice(Math.max(0, match.index - 40), match.index);
          const after = text.slice(
            match.index + match[0].length,
            Math.min(text.length, match.index + match[0].length + 40)
          );

          for (const connector of COMPARISON_CONNECTORS) {
            const parts = before.split(connector);
            if (parts.length >= 2) {
              const leftPart = parts[parts.length - 1].trim();
              for (const name of entityNames) {
                if (leftPart.includes(name)) {
                  const rightPart = after.trim();
                  for (const name2 of entityNames) {
                    if (name2 !== name && rightPart.includes(name2)) {
                      const eA = entityByName.get(name);
                      const eB = entityByName.get(name2);
                      if (eA && eB) {
                        const key = `comparison::${eA.id}::${eB.id}`;
                        if (!relationKeys.has(key)) {
                          relationKeys.add(key);
                          relations.push({
                            id: `rel_comparison_${eA.id.slice(0, 8)}_${eB.id.slice(0, 8)}`,
                            sourceId: eA.id,
                            targetId: eB.id,
                            type: 'comparison',
                            weight: 2,
                            evidence: [text.slice(Math.max(0, match.index - 30), Math.min(text.length, match.index + 30))],
                          });
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
}
