import { layout } from './layout';
export interface LabelBox { id:number; x:number; y:number; width:number; height:number }
export function arrangeLabels(boxes: LabelBox[], targetId?: number) {
  const result = new Map<number, { x:number; visible:boolean; depth:number }>();
  const occupied: { x:number; y:number; width:number; height:number }[] = [];
  const ordered = [...boxes].sort((a,b) => Number(b.id === targetId) - Number(a.id === targetId) || a.x-b.x || a.id-b.id);
  for (const box of ordered) {
    const x = Math.max(layout.homeX + 8 + box.width/2, Math.min(box.x,layout.homeX + layout.width - 8 - box.width/2));
    const rect = { x:x-box.width/2,y:box.y,width:box.width,height:box.height };
    const visible = box.x <= layout.targetX && !occupied.some(other => rect.x < other.x+other.width+8 && rect.x+rect.width+8 > other.x && rect.y < other.y+other.height+6 && rect.y+rect.height+6 > other.y);
    if (visible) occupied.push(rect);
    result.set(box.id,{ x,visible,depth:box.id === targetId ? 150 : 100 });
  }
  return result;
}
