import type { EntityType, RelationType } from '../../types';
import { ENTITY_COLORS, RELATION_COLORS, ENTITY_LABELS, RELATION_LABELS } from '../../utils/graphConstants';

interface GraphLegendProps {
  entityTypes?: EntityType[];
  relationTypes?: RelationType[];
}

export function GraphLegend({
  entityTypes = ['person', 'location', 'organization', 'term'],
  relationTypes = ['citation', 'dependency', 'comparison', 'cooccurrence'],
}: GraphLegendProps) {
  return (
    <>
      <div className="absolute bottom-4 left-4 flex flex-col gap-1.5">
        {entityTypes.map((type) => (
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
        {relationTypes.map((type) => (
          <div key={type} className="flex items-center gap-1.5 text-xs text-slate-600">
            <span
              className="inline-block h-0.5 w-4"
              style={{ backgroundColor: RELATION_COLORS[type] }}
            />
            {RELATION_LABELS[type]}
          </div>
        ))}
      </div>
    </>
  );
}
