export const powerTypes = ['cherry','pepper','ice','doom'] as const;
export type Power = typeof powerTypes[number];
// Duration of the classic explode tracks at their authored frame rates.
export const powerWarmup:Record<Power,number>={cherry:14/30,pepper:13/12,ice:1,doom:33/12};
export const powerInfo = {
 cherry:{key:'1',name:'樱桃炸弹',description:'炸掉目标附近三路僵尸'},
 pepper:{key:'2',name:'火爆辣椒',description:'清除目标所在整路'},
 ice:{key:'3',name:'寒冰菇',description:'冻结场上僵尸 6 秒'},
 doom:{key:'4',name:'毁灭菇',description:'炸掉目标附近更大范围僵尸'},
};
export interface ItemDrop { id:number; power:Power; x:number; lane:number }
export const emptyPowers = ():Record<Power,number>=>({cherry:0,pepper:0,ice:0,doom:0});
