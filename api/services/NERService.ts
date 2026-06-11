import type { Paragraph, EntityType, Entity, SentimentType } from '../../shared/types.js';

interface RawMention {
  name: string;
  type: EntityType;
  paragraphId: string;
  paragraphIndex: number;
  context: string;
}

const CHINESE_SURNAMES =
  '赵钱孙李周吴郑王冯陈褚卫蒋沈韩杨朱秦尤许何吕施张孔曹严华金魏陶姜戚谢邹喻柏水窦章云苏潘葛奚范彭郎鲁韦昌马苗凤花方俞任袁柳酆鲍史唐费廉岑薛雷贺倪汤滕殷罗毕郝邬安常乐于时傅皮卞齐康伍余元卜顾孟平黄和穆萧尹姚邵湛汪祁毛禹狄米贝明臧计伏成戴谈宋茅庞熊纪舒屈项祝董梁杜阮蓝闵席季麻强贾路娄危江童颜郭梅盛林刁钟徐邱骆高夏蔡田樊胡凌霍虞万支柯昝管卢莫经房裘缪干解应宗丁宣贲邓郁单杭洪包诸左石崔吉钮龚程嵇邢滑裴陆荣翁荀羊於惠甄曲家封芮羿储靳汲邴糜松井段富巫乌焦巴弓牧隗山谷车侯宓蓬全郗班仰秋仲伊宫宁仇栾暴甘钭厉戎祖武符刘景詹束龙叶幸司韶郜黎蓟薄印宿白怀蒲邰从鄂索咸籍赖卓蔺屠蒙池乔阴郁胥能苍双闻莘党翟谭贡劳逄姬申扶堵冉宰郦雍却璩桑桂濮牛寿通边扈燕冀郏浦尚农温别庄晏柴瞿阎充慕连茹习宦艾鱼容向古易慎戈廖庾终暨居衡步都耿满弘匡国文寇广禄阙东欧殳沃利蔚越夔隆师巩厍聂晁勾敖融冷訾辛阚那简饶空曾毋沙乜养鞠须丰巢关蒯相查后荆红游竺权逯盖益桓公';

const LOCATION_KEYWORDS = [
  '省', '市', '区', '县', '镇', '乡', '村', '州', '旗',
  '北京', '上海', '天津', '重庆',
  '河北', '山西', '辽宁', '吉林', '黑龙江', '江苏', '浙江', '安徽', '福建', '江西',
  '山东', '河南', '湖北', '湖南', '广东', '海南', '四川', '贵州', '云南', '陕西',
  '甘肃', '青海', '台湾',
  '内蒙古', '广西', '西藏', '宁夏', '新疆',
  '香港', '澳门',
  '伦敦', '纽约', '东京', '巴黎', '柏林', '莫斯科', '华盛顿', '旧金山', '洛杉矶',
  '硅谷', '华尔街',
];

const ORG_SUFFIXES = [
  '公司', '集团', '有限公司', '股份', '银行', '基金', '交易所',
  '大学', '学院', '研究院', '研究所', '实验室',
  '医院', '中心', '协会', '学会', '委员会', '联盟', '组织',
  '部', '局', '厅', '处', '司', '署', '院', '馆',
  'Inc', 'Corp', 'Ltd', 'LLC', 'LLP', 'Co', 'Group',
  'Foundation', 'Institute', 'University', 'Association',
  'Corporation', 'Organization', 'Agency', 'Bureau',
];

const ORG_PREFIXES = [
  '中国', '中华', '国家', '中央', '国际', '世界', '联合国',
  '中共', '全国',
];

const TERM_PATTERNS: Array<{ regex: RegExp; type: EntityType }> = [
  { regex: /[\u4e00-\u9fff]+(?:算法|模型|框架|架构|协议|标准|规范|方法|技术|理论|原理|范式|模式|策略|机制|体系|平台|系统|引擎|容器|微服务|组件|模块|接口|服务|中间件|数据库|区块链|云计算|大数据|人工智能|机器学习|深度学习|神经网络|自然语言处理|计算机视觉|物联网|5G|量子|边缘计算|联邦学习|知识图谱|前端|后端|全栈|微前端|低代码|无代码|数据湖|数据仓库|数据中台|业务中台|技术中台|容器化|编排|服务网格|DevOps|可观测性|混沌工程|安全|隐私计算|同态加密|零信任|数字孪生|元宇宙|Web3)/g, type: 'term' },
  { regex: /[A-Z][a-z]*(?:[A-Z][a-z]*)+(?:\.js|\.ts|\.py)?/g, type: 'term' },
  { regex: /(?:React|Vue|Angular|Svelte|Next\.js|Nuxt|Django|Flask|Spring|Express|Koa|TensorFlow|PyTorch|Keras|Hadoop|Spark|Kubernetes|Docker|Git|Linux|SQL|NoSQL|GraphQL|REST|gRPC|HTTP|HTTPS|TCP|UDP|API|SDK|IDE|CI\/CD|DevOps|Agile|Scrum|Kanban|TDD|BDD|SOLID|DRY|OOP|FP|RPC|MVC|MVVM|ORM|JWT|OAuth|SAML|SSO|LDAP|SaaS|PaaS|IaaS|FaaS|BaaS|Webpack|Vite|Rollup|ESBuild|Rust|Go|Python|Java|TypeScript|JavaScript|Kotlin|Swift|Dart|Ruby|PHP|C\+\+|Scala|R|Julia|Elixir|Haskell|Clojure|Erlang|Zig|Nim)/g, type: 'term' },
];

const POSITIVE_WORDS = [
  '优秀', '杰出', '领先', '创新', '突破', '成功', '高效', '卓越', '显著', '进步',
  '增长', '提升', '改善', '优化', '先进', '核心', '重要', '关键', '突出', '稳定',
  '可靠', '成熟', '强大', '灵活', '简洁', '优雅', '完善', '丰富', '快速', '精准',
  'excellent', 'outstanding', 'innovative', 'breakthrough', 'efficient', 'superior',
  'advanced', 'leading', 'significant', 'remarkable', 'robust', 'reliable', 'elegant',
];

const NEGATIVE_WORDS = [
  '问题', '风险', '缺陷', '不足', '挑战', '困难', '下降', '损失', '失败', '落后',
  '漏洞', '威胁', '危机', '衰退', '恶化', '薄弱', '瓶颈', '障碍', '隐患', '劣势',
  '复杂', '冗余', '脆弱', '过时', '混乱', '不稳定', '低效', '繁琐', '延迟', '冲突',
  'problem', 'risk', 'defect', 'challenge', 'decline', 'failure', 'weakness',
  'threat', 'crisis', 'bottleneck', 'fragile', 'deprecated', 'unstable',
];

function generateId(prefix: string, name: string): string {
  return `${prefix}_${name}_${Buffer.from(name).toString('base64url').slice(0, 12)}`;
}

function analyzeSentiment(context: string): { sentiment: SentimentType; score: number } {
  let score = 0;
  for (const w of POSITIVE_WORDS) {
    if (context.includes(w)) score += 1;
  }
  for (const w of NEGATIVE_WORDS) {
    if (context.includes(w)) score -= 1;
  }
  if (score > 0) return { sentiment: 'positive', score: Math.min(score / 3, 1) };
  if (score < 0) return { sentiment: 'negative', score: Math.max(score / 3, -1) };
  return { sentiment: 'neutral', score: 0 };
}

export class NERService {
  static extractFromParagraphs(
    paragraphs: Paragraph[],
    docId: string
  ): Entity[] {
    const mentionMap = new Map<string, RawMention[]>();

    for (const para of paragraphs) {
      const text = para.content;
      if (!text) continue;

      const mentions = NERService.extractMentions(text, para.id, para.index);

      for (const m of mentions) {
        const key = `${m.type}::${m.name}`;
        if (!mentionMap.has(key)) mentionMap.set(key, []);
        mentionMap.get(key)!.push(m);
      }
    }

    const entities: Entity[] = [];
    for (const [, mentions] of mentionMap) {
      const first = mentions[0];
      const contexts = mentions.map((m) => m.context);
      const avgSentiment = contexts.reduce(
        (sum, ctx) => sum + analyzeSentiment(ctx).score,
        0
      ) / contexts.length;

      let sentiment: SentimentType = 'neutral';
      if (avgSentiment > 0.1) sentiment = 'positive';
      else if (avgSentiment < -0.1) sentiment = 'negative';

      const uniqueParagraphIds = [...new Set(mentions.map((m) => m.paragraphId))];

      entities.push({
        id: generateId(first.type, first.name),
        name: first.name,
        type: first.type,
        frequency: mentions.length,
        docIds: [docId],
        paragraphIds: uniqueParagraphIds,
        summary: NERService.generateSummary(first.name, first.type, mentions),
        sentiment,
        sentimentScore: Math.round(avgSentiment * 100) / 100,
      });
    }

    return entities.sort((a, b) => b.frequency - a.frequency);
  }

  private static extractMentions(
    text: string,
    paragraphId: string,
    paragraphIndex: number
  ): RawMention[] {
    const mentions: RawMention[] = [];
    const used = new Set<string>();

    NERService.extractPersons(text, paragraphId, paragraphIndex, mentions, used);
    NERService.extractOrganizations(text, paragraphId, paragraphIndex, mentions, used);
    NERService.extractLocations(text, paragraphId, paragraphIndex, mentions, used);
    NERService.extractTerms(text, paragraphId, paragraphIndex, mentions, used);

    return mentions;
  }

  private static extractPersons(
    text: string,
    paragraphId: string,
    paragraphIndex: number,
    mentions: RawMention[],
    used: Set<string>
  ): void {
    const surnameArr = CHINESE_SURNAMES.split('');
    const surnamePattern = `[${surnameArr.join('')}]`;

    const personRegex = new RegExp(
      `(?:${surnamePattern}[\\u4e00-\\u9fff]{1,2})|(?:(?:Mr|Mrs|Ms|Dr|Prof)\\.?\\s+[A-Z][a-z]+)`,
      'g'
    );

    let match: RegExpExecArray | null;
    while ((match = personRegex.exec(text)) !== null) {
      const name = match[0];
      if (used.has(name)) continue;
      used.add(name);
      if (name.length < 2) continue;

      const commonWords = new Set([
        '中国', '中心', '中华', '中间', '主城', '主要', '主动', '主流',
        '广东', '广西', '山东', '山西', '江南', '海南', '云南',
        '北京', '南京', '东京', '西安', '济南',
        '中文', '中火', '中介', '主权', '主流',
      ]);
      if (commonWords.has(name)) continue;

      mentions.push({
        name,
        type: 'person',
        paragraphId,
        paragraphIndex,
        context: NERService.getContext(text, match.index, name.length),
      });
    }
  }

  private static extractOrganizations(
    text: string,
    paragraphId: string,
    paragraphIndex: number,
    mentions: RawMention[],
    used: Set<string>
  ): void {
    for (const suffix of ORG_SUFFIXES) {
      const regex = new RegExp(
        `(?:[\\u4e00-\\u9fff]{2,6}|[A-Z][A-Za-z\\s&]{2,30})${suffix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`,
        'g'
      );
      let match: RegExpExecArray | null;
      while ((match = regex.exec(text)) !== null) {
        const name = match[0];
        if (used.has(name)) continue;
        used.add(name);
        mentions.push({
          name,
          type: 'organization',
          paragraphId,
          paragraphIndex,
          context: NERService.getContext(text, match.index, name.length),
        });
      }
    }

    for (const prefix of ORG_PREFIXES) {
      const regex = new RegExp(
        `${prefix}[\\u4e00-\\u9fff]{2,8}`,
        'g'
      );
      let match: RegExpExecArray | null;
      while ((match = regex.exec(text)) !== null) {
        const name = match[0];
        if (used.has(name)) continue;
        used.add(name);
        if (name.length <= prefix.length + 1) continue;
        mentions.push({
          name,
          type: 'organization',
          paragraphId,
          paragraphIndex,
          context: NERService.getContext(text, match.index, name.length),
        });
      }
    }
  }

  private static extractLocations(
    text: string,
    paragraphId: string,
    paragraphIndex: number,
    mentions: RawMention[],
    used: Set<string>
  ): void {
    for (const loc of LOCATION_KEYWORDS) {
      if (used.has(loc)) continue;

      let idx = text.indexOf(loc);
      while (idx !== -1) {
        let start = idx;
        while (start > 0 && /[\u4e00-\u9fff]/.test(text[start - 1])) {
          start--;
        }
        let end = idx + loc.length;
        while (end < text.length && /[\u4e00-\u9fff]/.test(text[end])) {
          end++;
        }

        const name = text.slice(start, end);
        if (name.length >= 2 && !used.has(name)) {
          used.add(name);
          mentions.push({
            name,
            type: 'location',
            paragraphId,
            paragraphIndex,
            context: NERService.getContext(text, start, name.length),
          });
        }
        idx = text.indexOf(loc, idx + loc.length);
      }
    }

    const engLocRegex = /\b([A-Z][a-z]+(?:\s(?:City|State|Province|County|District|Region|Island|Peninsula|Valley|Bay|Coast))?)\b/g;
    let match: RegExpExecArray | null;
    while ((match = engLocRegex.exec(text)) !== null) {
      const name = match[1];
      if (used.has(name)) continue;
      used.add(name);
      mentions.push({
        name,
        type: 'location',
        paragraphId,
        paragraphIndex,
        context: NERService.getContext(text, match.index, name.length),
      });
    }
  }

  private static extractTerms(
    text: string,
    paragraphId: string,
    paragraphIndex: number,
    mentions: RawMention[],
    used: Set<string>
  ): void {
    for (const { regex, type } of TERM_PATTERNS) {
      const r = new RegExp(regex.source, regex.flags);
      let match: RegExpExecArray | null;
      while ((match = r.exec(text)) !== null) {
        const name = match[0];
        if (used.has(name) || name.length < 2) continue;
        used.add(name);
        mentions.push({
          name,
          type,
          paragraphId,
          paragraphIndex,
          context: NERService.getContext(text, match.index, name.length),
        });
      }
    }
  }

  private static getContext(
    text: string,
    index: number,
    length: number
  ): string {
    const start = Math.max(0, index - 30);
    const end = Math.min(text.length, index + length + 30);
    const ctx = text.slice(start, end);
    return start > 0 ? `...${ctx}` : ctx;
  }

  private static generateSummary(
    name: string,
    type: EntityType,
    mentions: RawMention[]
  ): string {
    const typeLabels: Record<EntityType, string> = {
      person: '人物',
      location: '地点',
      organization: '组织',
      term: '专业术语',
    };
    const freq = mentions.length;
    const paraCount = new Set(mentions.map((m) => m.paragraphId)).size;
    return `${name}（${typeLabels[type]}），出现 ${freq} 次，涉及 ${paraCount} 个段落`;
  }

  static mergeEntities(allEntityGroups: Entity[][]): Entity[] {
    const merged = new Map<string, Entity>();

    for (const group of allEntityGroups) {
      for (const entity of group) {
        const key = `${entity.type}::${entity.name}`;
        if (merged.has(key)) {
          const existing = merged.get(key)!;
          existing.frequency += entity.frequency;
          existing.docIds = [...new Set([...existing.docIds, ...entity.docIds])];
          existing.paragraphIds = [...new Set([...existing.paragraphIds, ...entity.paragraphIds])];
          existing.sentimentScore = (existing.sentimentScore + entity.sentimentScore) / 2;
          if (existing.sentimentScore > 0.1) existing.sentiment = 'positive';
          else if (existing.sentimentScore < -0.1) existing.sentiment = 'negative';
          else existing.sentiment = 'neutral';
          existing.summary = `${existing.name}，出现 ${existing.frequency} 次，涉及 ${existing.docIds.length} 篇文档、${existing.paragraphIds.length} 个段落`;
        } else {
          merged.set(key, { ...entity });
        }
      }
    }

    return Array.from(merged.values()).sort((a, b) => b.frequency - a.frequency);
  }
}
