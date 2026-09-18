export type TodoKind = 'chores' | 'pet' | 'plants' | 'health' | 'family';
export type TodoConfidence = 'high' | 'medium' | 'low';

export type TodoClassification = {
  kind: TodoKind;
  label: string;
  confidence: TodoConfidence;
  matched: string[];
};

type Rule = {
  kind: TodoKind;
  label: string;
  phrases: string[];
  keywords: string[];
};

const rules: Rule[] = [
  { kind: 'pet', label: '宠物', phrases: ['给guozi加水', '给国仔加水', '给国仔喂', '给宠物喂'], keywords: ['guozi', '国仔', '宠物', '喂猫', '喂狗', '遛狗', '遛猫', '猫砂', '狗粮', '加水'] },
  { kind: 'plants', label: '植物', phrases: ['阳台植物', '给花浇水', '给植物浇水'], keywords: ['植物', '盆栽', '绿萝', '花盆', '花草', '浇水', '施肥', '修剪'] },
  { kind: 'health', label: '健康', phrases: ['预约体检', '去健身房', '提醒吃药'], keywords: ['体检', '预约', '医院', '看病', '吃药', '药', '健身', '跑步', '锻炼', '牙医'] },
  { kind: 'family', label: '家人', phrases: ['给爸妈打电话', '提醒爸妈', '给妈妈打电话', '给爸爸打电话'], keywords: ['爸妈', '爸爸', '妈妈', '家人', '父母', '电话', '联系'] },
  { kind: 'chores', label: '家务', phrases: ['换洗床单', '整理房间', '清理厨房'], keywords: ['床单', '家务', '打扫', '清洁', '收拾', '整理', '洗衣', '洗碗', '拖地', '垃圾', '厨房'] },
];

const normalize = (value: string) => value.toLocaleLowerCase().replace(/[\s·。！？!?，,、]/g, '');

export function classifyTodo(value: string): TodoClassification {
  const text = normalize(value);
  const scored = rules.map((rule) => {
    const matched: string[] = [];
    let score = 0;
    for (const phrase of rule.phrases) {
      if (text.includes(normalize(phrase))) {
        score += 4;
        matched.push(phrase);
      }
    }
    for (const keyword of rule.keywords) {
      if (text.includes(normalize(keyword))) {
        score += 2;
        matched.push(keyword);
      }
    }
    return { rule, score, matched };
  }).sort((a, b) => b.score - a.score);

  const best = scored[0];
  const second = scored[1];
  if (!best || best.score === 0) {
    return { kind: 'chores', label: '日常杂项', confidence: 'low', matched: [] };
  }
  const margin = best.score - (second?.score ?? 0);
  const confidence: TodoConfidence = best.score >= 6 && margin >= 2 ? 'high' : best.score >= 4 && margin >= 2 ? 'medium' : 'low';
  return { kind: best.rule.kind, label: confidence === 'low' ? `可能是${best.rule.label}` : best.rule.label, confidence, matched: best.matched };
}
