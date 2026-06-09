-- 0051_lift_official_initial_dims.sql
--
-- spec-013 修正记录（2026-06-09）配套迁移。
--
-- 背景：`ensureRelationship` 现已真正消费 companion.initial_dims 作为开局种子
-- （precedence: initial_dims -> relationship_role default -> zeros，见 relationships/seed.ts）。
-- 0007 给官方 10 角色手写的 initial_dims 偏低（closeness 全 <20），即便接回也仍读成 Stranger，
-- 无法消除「预设关系角色开局却和陌生人一样」的违和。
--
-- 本迁移按各官方角色的 relationship_role，把 initial_dims 更新为 seed.ts 的默认兜底值
-- （保守·临门一脚：closeness 抬过 Stranger 线 20、其余压低）。UPDATE-by-id，不动 0007，幂等可重跑。
--
-- role 默认值（未列维度=0）：
--   stranger : closeness 0,  trust 0,  romance 0,  friendship 0
--   neighbor : closeness 21, trust 3,  romance 0,  friendship 5
--   colleague: closeness 22, trust 6,  romance 0,  friendship 8
--   friend   : closeness 24, trust 10, romance 0,  friendship 14
--   family   : closeness 25, trust 12, romance 0,  friendship 12
--   crush    : closeness 22, trust 4,  romance 14, friendship 5

-- crush: maya, sora, theo
UPDATE companions
   SET initial_dims = '{"closeness":22,"trust":4,"romance":14,"friendship":5,"hostility":0,"tension":0,"distance":0}',
       updated_at = strftime('%s','now') * 1000
 WHERE id IN ('maya', 'sora', 'theo');

-- colleague: ryan, aiko
UPDATE companions
   SET initial_dims = '{"closeness":22,"trust":6,"romance":0,"friendship":8,"hostility":0,"tension":0,"distance":0}',
       updated_at = strftime('%s','now') * 1000
 WHERE id IN ('ryan', 'aiko');

-- friend: ethan, marcus
UPDATE companions
   SET initial_dims = '{"closeness":24,"trust":10,"romance":0,"friendship":14,"hostility":0,"tension":0,"distance":0}',
       updated_at = strftime('%s','now') * 1000
 WHERE id IN ('ethan', 'marcus');

-- neighbor: iris
UPDATE companions
   SET initial_dims = '{"closeness":21,"trust":3,"romance":0,"friendship":5,"hostility":0,"tension":0,"distance":0}',
       updated_at = strftime('%s','now') * 1000
 WHERE id = 'iris';

-- stranger: lila, jordan (explicit zeros — intentionally still reads as Stranger)
UPDATE companions
   SET initial_dims = '{"closeness":0,"trust":0,"romance":0,"friendship":0,"hostility":0,"tension":0,"distance":0}',
       updated_at = strftime('%s','now') * 1000
 WHERE id IN ('lila', 'jordan');
