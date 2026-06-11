export type FileType = 'markdown' | 'docx';
export type ParagraphType = 'heading' | 'paragraph' | 'list' | 'code' | 'quote' | 'table';
export type AnnotationType = 'comment' | 'suggestion';
export type AnnotationStatus = 'pending' | 'accepted' | 'rejected';

export interface DocumentMeta {
  id: string;
  title: string;
  originalFileName: string;
  fileType: FileType;
  createdAt: string;
  updatedAt: string;
  shareToken?: string;
  sharePassword?: string | null;
  shareExpiresAt?: string | null;
  annotationCount: number;
  reviewerCount: number;
}

export interface Paragraph {
  id: string;
  index: number;
  type: ParagraphType;
  level?: number;
  content: string;
  rawHtml?: string;
}

export interface ParsedDocument {
  docId: string;
  paragraphs: Paragraph[];
}

export interface Annotation {
  id: string;
  docId: string;
  paragraphId: string;
  type: AnnotationType;
  reviewerName: string;
  reviewerEmail?: string;
  content: string;
  suggestedText?: string;
  originalText?: string;
  status: AnnotationStatus;
  ownerNote?: string;
  createdAt: string;
  updatedAt: string;
}

export type EntityType = 'person' | 'location' | 'organization' | 'term';

export type RelationType = 'citation' | 'dependency' | 'comparison' | 'cooccurrence';

export type SentimentType = 'positive' | 'neutral' | 'negative';

export interface Entity {
  id: string;
  name: string;
  type: EntityType;
  frequency: number;
  docIds: string[];
  paragraphIds: string[];
  summary: string;
  sentiment: SentimentType;
  sentimentScore: number;
}

export interface Relation {
  id: string;
  sourceId: string;
  targetId: string;
  type: RelationType;
  weight: number;
  evidence: string[];
}

export interface KnowledgeGraph {
  entities: Entity[];
  relations: Relation[];
}

export interface EntityStats {
  totalEntities: number;
  totalRelations: number;
  byType: Record<EntityType, number>;
  byRelationType: Record<RelationType, number>;
  topEntities: Array<{
    entity: Entity;
    relationCount: number;
  }>;
  sentimentDistribution: Record<SentimentType, number>;
}

export interface ReviewSummary {
  docId: string;
  totalAnnotations: number;
  pendingCount: number;
  acceptedCount: number;
  rejectedCount: number;
  commentCount: number;
  suggestionCount: number;
  byReviewer: { name: string; count: number }[];
  byParagraph: { paragraphId: string; count: number }[];
}
