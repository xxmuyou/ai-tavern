# 数据模型

> 本文档定义 D1 表结构、KV / R2 用法、表之间的关系。架构总览见 [`overview.md`](./overview.md)，API 端点见 [`api.md`](./api.md)。
>
> **关于"暂定"标注：** 字段类型与约束按 v1 合理设计，实施时会通过 migration 落地。

---

## 1. 存储分层

| 存储 | 用途 |
|------|------|
| **D1**（SQLite） | 用户、角色卡、场景、对话历史、关系数值、订阅、配置、日志 |
| **R2** | 角色立绘、场景插图、用户上传素材 |
| **KV** | 每日配额计数器、轻量缓存（如场景列表的内存化结果） |
| **Durable Objects** | v1 不主用（仅在引入群聊时启用） |
| **Queues** | 异步任务（对话历史摘要、thread memory 提取、邮件通知、清理 job） |

## 2. D1 表清单

| 表 | 用途 |
|----|------|
| `users` | 用户账户 |
| `user_identities` | 第三方身份绑定（Google / Apple / Email） |
| `sessions` | 登录会话（JWT 替代方案 / 黑名单） |
| `companions` | 角色卡（official + user-created 统一表，用 `source` 区分） |
| `scenes` | 场景定义（仅 official，用户不能自创场景） |
| `relationships` | 用户 ↔ companion 的关系数值（7 维度） |
| `threads` | 对话 thread（每对 user-companion 一条） |
| `messages` | 对话消息（流水） |
| `thread_memories` | 单线程结构化长期记忆（关系事实、偏好、承诺、未完成剧情） |
| `prompt_debug_snapshots` | admin/dev prompt 分段调试快照（可关闭） |
| `events` | 事件触发记录 |
| `billing_customers` | 用户与 Stripe Customer 映射 |
| `billing_subscriptions` | Stripe 订阅状态 |
| `billing_webhook_events` | Stripe webhook 幂等与处理审计 |
| `usage_log` | 配额计量与统计（补充 KV 计数器，用于审计 / 分析） |
| `llm_logs` | LLM 调用日志（调试 / 计费 / 报警） |
| `llm_config` | admin 配置：task ↔ provider/model 映射 |
| `admin_users` | admin 邮箱白名单（继承 `admin@aiappsbox.com` 设计） |
| `credit_accounts` | 积分余额缓存（available / reserved） |
| `credit_ledger_entries` | 积分流水不可变账本（发放 / 购买 / 预占 / 结算 / 退款 / 调整） |
| `user_companion_voice_settings` | 用户对单个 companion 的聊天语音设置 |
| `voice_generation_charges` | 聊天语音首次生成扣费记录 |
| `image_generation_jobs` | 通用生图任务（未绑定 companion 的生图，如创建前 base-art 草稿） |

---

## 3. 表设计详细

### 3.1 `users`

```sql
CREATE TABLE users (
  id                 TEXT PRIMARY KEY,         -- UUIDv7
  email              TEXT UNIQUE NOT NULL,
  email_verified     BOOLEAN DEFAULT FALSE,
  display_name       TEXT,
  locale             TEXT DEFAULT 'en-US',     -- v1 仅 en-US，留字段给 v2
  created_at         INTEGER NOT NULL,         -- unix epoch (ms)
  last_seen_at       INTEGER NOT NULL,
  status             TEXT DEFAULT 'active',    -- active / suspended / deleted
  romance_preference TEXT NOT NULL DEFAULT 'any'  -- 'male' / 'female' / 'any'，影响场景伴侣加权 spawn（spec-017）
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_last_seen ON users(last_seen_at);
```

### 3.1.1 `user_identities`

第三方登录身份绑定。一个 `users` 可以绑多个身份（Google + Apple + Email 都能登同一账号）。

```sql
CREATE TABLE user_identities (
  id               TEXT PRIMARY KEY,           -- UUIDv7
  user_id          TEXT NOT NULL REFERENCES users(id),
  provider         TEXT NOT NULL,              -- 'google' / 'apple' / 'email'
  provider_subject TEXT NOT NULL,              -- provider 的稳定 ID（Google `sub`, Apple `sub`, email 时填 email）
  provider_email   TEXT,                       -- provider 当时提供的 email（可能与 users.email 不同）
  created_at       INTEGER NOT NULL,
  UNIQUE (provider, provider_subject)
);

CREATE INDEX idx_identities_user ON user_identities(user_id);
```

**自动合并逻辑：** 登录时若 `provider_email` 与已有 `users.email` 匹配，提示用户"已有账号，是否合并？"（v1 自动合并 *(暂定)*；可改成需用户确认）。

### 3.2 `sessions`

```sql
CREATE TABLE sessions (
  id            TEXT PRIMARY KEY,              -- session ID
  user_id       TEXT NOT NULL REFERENCES users(id),
  jwt_jti       TEXT UNIQUE,                   -- JWT ID 用于撤销
  created_at    INTEGER NOT NULL,
  expires_at    INTEGER NOT NULL,
  revoked_at    INTEGER                        -- 主动撤销时间
);

CREATE INDEX idx_sessions_user ON sessions(user_id);
CREATE INDEX idx_sessions_expires ON sessions(expires_at);
```

**说明：** v1 用 JWT 直接验证，但保留 sessions 表以便后续支持登出 / 撤销。

### 3.3 `companions`

```sql
CREATE TABLE companions (
  id                TEXT PRIMARY KEY,           -- UUIDv7
  source            TEXT NOT NULL,              -- 'official' / 'user'
  created_by        TEXT REFERENCES users(id),  -- user 自创时填，official 为 NULL
  is_active         BOOLEAN DEFAULT TRUE,       -- 软删除标记
  name              TEXT NOT NULL,
  gender            TEXT,                       -- 'male' / 'female'（spec-017，仅用于场景加权 spawn）
  appearance        TEXT,                       -- 外貌描述（注入 prompt）
  personality       TEXT,                       -- 性格描述
  background        TEXT,                       -- 背景故事
  speech_style      TEXT,                       -- 说话风格
  relationship_role TEXT,                       -- colleague/neighbor/friend/crush/stranger/family
  voice_id          TEXT,                       -- MiniMax voice id；NULL 时按 gender 用 config 默认
  voice_speed       TEXT DEFAULT 'medium',      -- slow / medium / fast
  preferred_scenes  TEXT,                       -- JSON array of scene_id
  art_url           TEXT,                       -- R2 上的立绘 URL
  art_emotions      TEXT,                       -- JSON map: emotion -> url（spec-012）
  initial_dims      TEXT,                       -- JSON of {closeness:n, trust:n, ...} 起始数值
  created_at        INTEGER NOT NULL,
  updated_at        INTEGER NOT NULL
);

CREATE INDEX idx_companions_source ON companions(source);
CREATE INDEX idx_companions_owner ON companions(created_by);
CREATE INDEX idx_companions_active ON companions(is_active);
```

**约束：**
- official 角色 `created_by IS NULL`
- user 角色 `created_by IS NOT NULL`
- 一个 user 最多创建 3 个 active companion（免费）/ 不限（订阅）—— 应用层校验

### 3.4 `scenes`

```sql
CREATE TABLE scenes (
  id                TEXT PRIMARY KEY,           -- 如 'pier_cafe'
  name              TEXT NOT NULL,              -- 'Pier Cafe'
  mood              TEXT NOT NULL,              -- 注入 prompt 的氛围描述
  tags              TEXT,                       -- JSON array (cafe/office/...)
  possible_events   TEXT,                       -- JSON array of event_type_id
  default_companions TEXT,                      -- JSON array of companion_id (官方偏好出现的角色)
  unlock_condition  TEXT,                       -- JSON: { "min_relationship": {"companion_id": "xx", "dim": "romance", "value": 50} } 或 NULL
  art_url           TEXT,                       -- R2 上的场景插图
  display_order     INTEGER DEFAULT 0,
  is_active         BOOLEAN DEFAULT TRUE,
  created_at        INTEGER NOT NULL
);

CREATE INDEX idx_scenes_active ON scenes(is_active);
CREATE INDEX idx_scenes_order ON scenes(display_order);
```

**注：** 场景由产品方预写，用户不能创建。

### 3.5 `relationships`

每对（user, companion）一条记录，存当前 7 维度数值。

```sql
CREATE TABLE relationships (
  user_id        TEXT NOT NULL REFERENCES users(id),
  companion_id   TEXT NOT NULL REFERENCES companions(id),
  closeness      INTEGER DEFAULT 0,             -- 0-100
  trust          INTEGER DEFAULT 0,
  romance        INTEGER DEFAULT 0,
  friendship     INTEGER DEFAULT 0,
  hostility      INTEGER DEFAULT 0,
  tension        INTEGER DEFAULT 0,
  distance       INTEGER DEFAULT 0,
  level_label    TEXT,                          -- 'Stranger' / 'Friend' / 'Lover' / 'Hostile' / ... （由维度组合实时算或缓存）
  first_met_at   INTEGER NOT NULL,
  last_interaction_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, companion_id)
);

CREATE INDEX idx_relationships_companion ON relationships(companion_id);
CREATE INDEX idx_relationships_last_interaction ON relationships(last_interaction_at);
```

**说明：**
- 维度范围全部 0-100（用 `CHECK` 约束在 application 层强制）
- `level_label` 可以每次更新数值时一并算出来存（避免读时计算）
- `first_met_at` 是用户第一次与该角色互动的时间（用于"认识 X 天"提示）

### 3.6 `threads`

每对 (user, companion) 一条对话 thread。

```sql
CREATE TABLE threads (
  id             TEXT PRIMARY KEY,              -- UUIDv7
  user_id        TEXT NOT NULL REFERENCES users(id),
  companion_id   TEXT NOT NULL REFERENCES companions(id),
  scene_context  TEXT,                          -- JSON: 当前所在场景上下文（最后一次互动时的）
  summary        TEXT,                          -- 老消息的 LLM 摘要（异步生成）
  summary_until_message_id TEXT,                -- 摘要覆盖到哪条消息
  message_count  INTEGER DEFAULT 0,
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL,
  UNIQUE (user_id, companion_id)
);

CREATE INDEX idx_threads_user ON threads(user_id);
CREATE INDEX idx_threads_updated ON threads(updated_at);
```

### 3.7 `messages`

```sql
CREATE TABLE messages (
  id             TEXT PRIMARY KEY,              -- UUIDv7
  thread_id      TEXT NOT NULL REFERENCES threads(id),
  role           TEXT NOT NULL,                 -- 'user' / 'companion' / 'system'
  content        TEXT NOT NULL,
  scene_id       TEXT,                          -- 此消息发生时所在场景
  signals        TEXT,                          -- companion 回应时附带的 JSON 信号 (closeness:+1, romance:+1, ...)
  emotion        TEXT,                          -- companion 的情绪标签
  llm_provider   TEXT,                          -- 用了哪家供应商
  llm_model      TEXT,
  token_input    INTEGER,                       -- 此消息消耗的 input tokens
  token_output   INTEGER,
  created_at     INTEGER NOT NULL
);

CREATE INDEX idx_messages_thread ON messages(thread_id, created_at);
CREATE INDEX idx_messages_created ON messages(created_at);
```

**说明：**
- `signals` 仅在 role='companion' 时填
- 老消息不删除（用于审计 / 用户复看），但 prompt 注入只用最近 N 条 + 摘要 + 当前 thread 的结构化 memory

### 3.7a `thread_memories`

当前 `(user, companion, thread)` 内的长期记忆。第一版不跨 thread、不跨角色共享，避免串戏和隐私边界不清。

```sql
CREATE TABLE thread_memories (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES users(id),
  companion_id  TEXT NOT NULL REFERENCES companions(id),
  thread_id     TEXT NOT NULL REFERENCES threads(id),
  kind          TEXT NOT NULL,                 -- relationship_fact / user_preference / promise / open_loop / character_state
  content       TEXT NOT NULL,                 -- standalone sentence，直接注入 prompt 也能理解
  importance    INTEGER NOT NULL DEFAULT 50,   -- 1..100，越高越优先注入
  status        TEXT NOT NULL DEFAULT 'active',-- active / resolved / dismissed
  source        TEXT NOT NULL DEFAULT 'ai_extract',
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);

CREATE INDEX idx_thread_memories_thread
  ON thread_memories(thread_id, status, importance, updated_at);
CREATE INDEX idx_thread_memories_user_companion
  ON thread_memories(user_id, companion_id, status);
```

**说明：**
- 写入由异步 `memory_extract` LLM task 驱动；失败不影响主聊天链路。
- prompt 注入最多取 active 记忆，按 `importance DESC, updated_at DESC` 排序。
- `summary` 仍负责压缩历史；`thread_memories` 负责可复用事实。

### 3.7b `prompt_debug_snapshots`

admin/dev 下的 prompt inspector 数据。用于解释每轮哪些 segment 被注入、哪些被预算裁剪。

```sql
CREATE TABLE prompt_debug_snapshots (
  id             TEXT PRIMARY KEY,
  user_id        TEXT REFERENCES users(id),
  companion_id   TEXT,
  thread_id      TEXT,
  message_id     TEXT,
  segments_json  TEXT NOT NULL,                -- segment id/role/priority/token/included/trim_reason
  token_estimate INTEGER,
  created_at     INTEGER NOT NULL
);

CREATE INDEX idx_prompt_debug_thread
  ON prompt_debug_snapshots(thread_id, created_at);
```

**说明：**
- 可由 feature flag 在 prod 关闭写入。
- 不记录 API key、Authorization header 或 provider secrets。
- 仅 admin/dev 端点可读，普通用户没有 prompt debug API。

### 3.8 `events`

事件触发与处理记录。

```sql
CREATE TABLE events (
  id             TEXT PRIMARY KEY,              -- UUIDv7
  user_id        TEXT NOT NULL REFERENCES users(id),
  companion_id   TEXT NOT NULL REFERENCES companions(id),
  scene_id       TEXT NOT NULL REFERENCES scenes(id),
  event_type     TEXT NOT NULL,                 -- 'daily_encounter' / 'invitation' / 'conflict' / 'gift' / 'confession' / 'milestone'
  payload        TEXT,                          -- JSON: 事件的具体内容（AI 生成的描述、选项等）
  status         TEXT DEFAULT 'pending',        -- pending / resolved / dismissed
  resolution     TEXT,                          -- JSON: 用户选择的选项 + 后果
  created_at     INTEGER NOT NULL,
  resolved_at    INTEGER
);

CREATE INDEX idx_events_user_companion ON events(user_id, companion_id);
CREATE INDEX idx_events_status ON events(status);
CREATE INDEX idx_events_type ON events(event_type);
```

**说明：**
- 每种 `event_type` 对每个 companion 有冷却时间（应用层管理）
- 同一时间一个 (user, companion) 最多一个 pending 事件

### 3.9 `billing_customers`

```sql
CREATE TABLE billing_customers (
  user_id            TEXT PRIMARY KEY REFERENCES users(id),
  stripe_customer_id TEXT NOT NULL UNIQUE,
  email              TEXT NOT NULL,
  livemode           INTEGER NOT NULL DEFAULT 0,
  created_at         INTEGER NOT NULL,
  updated_at         INTEGER NOT NULL
);

CREATE INDEX idx_billing_customers_stripe ON billing_customers(stripe_customer_id);
```

### 3.10 `billing_subscriptions`

```sql
CREATE TABLE billing_subscriptions (
  id                   TEXT PRIMARY KEY,        -- Stripe subscription ID
  user_id              TEXT NOT NULL REFERENCES users(id),
  stripe_customer_id   TEXT NOT NULL,
  status               TEXT NOT NULL,           -- active / trialing / past_due / canceled / unpaid
  price_id             TEXT NOT NULL,
  current_period_start INTEGER NOT NULL,
  current_period_end   INTEGER NOT NULL,
  cancel_at_period_end INTEGER NOT NULL DEFAULT 0,
  canceled_at          INTEGER,
  livemode             INTEGER NOT NULL DEFAULT 0,
  raw_json             TEXT NOT NULL,
  created_at           INTEGER NOT NULL,
  updated_at           INTEGER NOT NULL
);

CREATE INDEX idx_billing_subscriptions_user ON billing_subscriptions(user_id);
CREATE INDEX idx_billing_subscriptions_customer ON billing_subscriptions(stripe_customer_id);
CREATE INDEX idx_billing_subscriptions_status ON billing_subscriptions(status);
CREATE INDEX idx_billing_subscriptions_period_end ON billing_subscriptions(current_period_end);
```

**判断 Pro 权益：** `status IN ('active', 'trialing') AND current_period_end > now()`；多条订阅时取仍有效且 `current_period_end` 最新的一条。所有 billing timestamp 存 Unix milliseconds；Stripe seconds timestamp 在 webhook/repository 边界转换。

### 3.11 `billing_webhook_events`

```sql
CREATE TABLE billing_webhook_events (
  id           TEXT PRIMARY KEY,                -- Stripe event ID
  type         TEXT NOT NULL,
  livemode     INTEGER NOT NULL DEFAULT 0,
  status       TEXT NOT NULL,                   -- processing / processed / failed / ignored
  error        TEXT,
  received_at  INTEGER NOT NULL,
  processed_at INTEGER
);

CREATE INDEX idx_billing_webhook_events_type ON billing_webhook_events(type);
```

### 3.12 `usage_log`

D1 上的使用日志（KV 是热路径计数器，D1 是冷数据审计）。

```sql
CREATE TABLE usage_log (
  id             TEXT PRIMARY KEY,              -- UUIDv7
  user_id        TEXT NOT NULL REFERENCES users(id),
  date_utc       TEXT NOT NULL,                 -- YYYY-MM-DD
  message_count  INTEGER DEFAULT 0,             -- 当日发出消息数
  event_count    INTEGER DEFAULT 0,
  llm_cost_usd   REAL DEFAULT 0,                -- 当日 LLM 总成本
  created_at     INTEGER NOT NULL,
  UNIQUE (user_id, date_utc)
);

CREATE INDEX idx_usage_user_date ON usage_log(user_id, date_utc);
```

**写入策略：** 每次 LLM 调用完成后异步更新此表（Queues 任务，避免阻塞响应）。

### 3.13 `llm_logs`

```sql
CREATE TABLE llm_logs (
  id             TEXT PRIMARY KEY,
  user_id        TEXT REFERENCES users(id),
  task           TEXT NOT NULL,                 -- chat / signal / summary / character-assist
  provider       TEXT NOT NULL,                 -- deepseek / openai / anthropic / doubao / minimax / cloudflare
  model          TEXT NOT NULL,
  status         TEXT NOT NULL,                 -- success / fallback / error
  latency_ms     INTEGER,
  token_input    INTEGER,
  token_output   INTEGER,
  cost_usd       REAL,
  error_code     TEXT,
  error_message  TEXT,
  created_at     INTEGER NOT NULL
);

CREATE INDEX idx_llm_logs_user ON llm_logs(user_id, created_at);
CREATE INDEX idx_llm_logs_status ON llm_logs(status);
CREATE INDEX idx_llm_logs_provider ON llm_logs(provider, created_at);
```

**容量考虑：** 高频写入。可以定期归档（30 天前的 log 移到 R2）。

### 3.14 `llm_config`

admin 配置 task ↔ provider/model 的映射。

```sql
CREATE TABLE llm_config (
  task           TEXT PRIMARY KEY,              -- 'chat' / 'signal' / 'summary' / 'memory_extract' / 'character-assist'
  provider       TEXT NOT NULL,
  model          TEXT NOT NULL,
  fallback_provider TEXT,
  fallback_model TEXT,
  updated_at     INTEGER NOT NULL,
  updated_by     TEXT REFERENCES users(id)
);
```

**初始数据（migration seed）：**

```sql
INSERT INTO llm_config VALUES
  ('chat',             'minimax',    'MiniMax-M3',                   'deepseek',   'deepseek-chat', ...),
  ('signal',           'deepseek',   'deepseek-chat',                NULL,         NULL,          ...),
  ('summary',          'cloudflare', '@cf/meta/llama-3.1-8b-instruct', 'deepseek', 'deepseek-chat', ...),
  ('memory_extract',   'deepseek',   'deepseek-chat',                'openai',     'gpt-4o-mini', ...),
  ('character-assist', 'deepseek',   'deepseek-chat',                NULL,         NULL,          ...);
```

### 3.15 `admin_users`

```sql
CREATE TABLE admin_users (
  user_id        TEXT PRIMARY KEY REFERENCES users(id),
  role           TEXT NOT NULL DEFAULT 'admin', -- 未来可扩展 'support' / 'content'
  granted_at     INTEGER NOT NULL,
  granted_by     TEXT REFERENCES users(id)
);
```

**初始数据：** 在第一次 `admin@aiappsbox.com` 注册时 migration 自动插入。

### 3.16 `credit_accounts`

```sql
CREATE TABLE credit_accounts (
  user_id              TEXT PRIMARY KEY REFERENCES users(id),
  available_credits    INTEGER NOT NULL DEFAULT 0,   -- 可用积分
  reserved_credits     INTEGER NOT NULL DEFAULT 0,   -- 已预占（reserve 未结算）
  updated_at           INTEGER NOT NULL
);
```

当前积分余额缓存（spec-021，migration `0017`）。真相来源是 `credit_ledger_entries`；所有变更通过 ledger helper 的**原子条件 UPDATE**（`... WHERE available_credits >= :n`）+ 同批 ledger 写入完成，禁止业务代码直接写本表。

### 3.17 `credit_ledger_entries`

```sql
CREATE TABLE credit_ledger_entries (
  id                   TEXT PRIMARY KEY,
  user_id              TEXT NOT NULL REFERENCES users(id),
  type                 TEXT NOT NULL,           -- grant_monthly / purchase / reserve / commit / release / refund / expire / adjustment
  amount               INTEGER NOT NULL,        -- 有符号：正=增加可用/释放预占，负=减少可用/确认消费
  balance_after        INTEGER,
  reserved_after       INTEGER,
  task_type            TEXT,                    -- chat_message / image_generation / voice_generation / ...
  reference_type       TEXT,                    -- monthly_grant / signup_grant / stripe_session / reservation / ...
  reference_id         TEXT,
  stripe_session_id    TEXT,
  stripe_payment_id    TEXT,
  expires_at           INTEGER,                 -- v1 恒为 NULL（赠送不过期，见 spec-021 §关键决策 1）
  metadata             TEXT,                    -- JSON
  created_at           INTEGER NOT NULL
);

CREATE UNIQUE INDEX idx_credit_ledger_reference
  ON credit_ledger_entries(type, reference_type, reference_id)
  WHERE reference_type IS NOT NULL AND reference_id IS NOT NULL;

CREATE INDEX idx_credit_ledger_user_time ON credit_ledger_entries(user_id, created_at);
CREATE INDEX idx_credit_ledger_expiry ON credit_ledger_entries(expires_at);
```

不可变流水账本（spec-021，migration `0017`）。`idx_credit_ledger_reference` 唯一索引保证**幂等**：同一 `(type, reference_type, reference_id)` 重复写入返回已存在条目而非二次入账（月度/注册赠送、Stripe 购买、reserve 都依赖它去重）。reserve→commit/release 模型：`reserve` 把 available 转入 reserved，`commit` 确认扣除，`release`/`refund` 退回 available。

### 3.18 `user_companion_voice_settings`

```sql
CREATE TABLE user_companion_voice_settings (
  user_id       TEXT NOT NULL REFERENCES users(id),
  companion_id  TEXT NOT NULL REFERENCES companions(id),
  voice_id      TEXT NOT NULL,
  voice_speed   TEXT NOT NULL DEFAULT 'medium',
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL,
  PRIMARY KEY (user_id, companion_id)
);

CREATE INDEX idx_user_companion_voice_settings_companion
  ON user_companion_voice_settings(companion_id);
```

聊天内声音设置表（migration `0058`）。声音是用户偏好，不是 companion 全局编辑；官方 companion 和用户自创 companion 都通过这张表存当前用户的 override。运行时解析顺序为 user override → companion default → MiniMax gender default。

### 3.19 `voice_generation_charges`

```sql
CREATE TABLE voice_generation_charges (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL REFERENCES users(id),
  companion_id    TEXT NOT NULL REFERENCES companions(id),
  message_id      TEXT NOT NULL REFERENCES messages(id),
  voice_id        TEXT NOT NULL,
  voice_speed     TEXT NOT NULL,
  reservation_id  TEXT,
  created_at      INTEGER NOT NULL
);

CREATE UNIQUE INDEX idx_voice_generation_charges_unique
  ON voice_generation_charges(user_id, companion_id, message_id, voice_id, voice_speed);

CREATE INDEX idx_voice_generation_charges_user_time
  ON voice_generation_charges(user_id, created_at);
```

聊天语音扣费记录（migration `0058`）。同一用户、同一 message、同一 voice/speed 的成功语音只扣一次；重复播放走 R2 缓存和这张表免重复扣费。`reservation_id` 指向对应 credit ledger reserve，成功后 commit，provider 失败 release。

### 3.20 `image_generation_jobs`

```sql
CREATE TABLE image_generation_jobs (
  id                    TEXT PRIMARY KEY,
  user_id               TEXT REFERENCES users(id),
  task                  TEXT NOT NULL,          -- e.g. companion_base_art
  mode                  TEXT NOT NULL,          -- text_to_image / image_to_image / edit
  status                TEXT NOT NULL,          -- pending / processing / succeeded / failed / cancelled
  style                 TEXT,
  provider              TEXT,
  model                 TEXT,
  prompt                TEXT NOT NULL,
  negative_prompt       TEXT,
  input_keys            TEXT,                   -- JSON array of R2 keys/URLs
  mask_key              TEXT,
  output_prefix         TEXT NOT NULL,
  output_key            TEXT,
  output_content_type   TEXT,
  provider_task_id      TEXT,
  provider_submitted_at INTEGER,
  provider_last_polled_at INTEGER,
  provider_result_received_at INTEGER,
  provider_task_cost_time_ms INTEGER,
  provider_consume_coins REAL,
  error_code            TEXT,
  error_message         TEXT,
  retry_count           INTEGER NOT NULL DEFAULT 0,
  billing_ref           TEXT,                   -- 积分预占引用：记录该 job 的 reserve reservation_id（spec-021 接线用）
  created_at            INTEGER NOT NULL,
  updated_at            INTEGER NOT NULL,
  completed_at          INTEGER
);

CREATE INDEX idx_image_generation_jobs_user ON image_generation_jobs(user_id, created_at);
CREATE INDEX idx_image_generation_jobs_task_status ON image_generation_jobs(task, status, updated_at);
CREATE INDEX idx_image_generation_jobs_provider_task ON image_generation_jobs(provider_task_id);
```

通用生图任务表（spec-020 §C / spec-022，migration `0018`；provider 诊断字段见 migration `0060` / `0061`），承载未绑定 companion 的生图（首个消费者是创建前的 base-art 草稿）。`provider_submitted_at` 记录拿到 RunningHub taskId 的时间；`provider_last_polled_at` 记录后端最近一次主动查询 RunningHub outputs/status 的时间，pending poll 只更新该字段、不更新 `updated_at`；`provider_result_received_at` 记录 webhook/cron/poll 回收终态结果的时间；`provider_task_cost_time_ms` 与 `provider_consume_coins` 来自 RunningHub output。**积分接线**：创建 job 前 `reserveCredits(image_generation=40)`，把返回的 `reservation_id` 写入 `billing_ref`；job 落终态时由统一收敛点按 `billing_ref` 做 commit（succeeded）/ release（failed/cancelled），见 spec-021 §F。

---

## 4. KV 命名空间

| Key 模式 | 值 | TTL | 用途 |
|---------|----|----|------|
| `quota:{user_id}:{YYYY-MM-DD}:messages` | int | 90,000 秒 | 当日消息配额计数（free 硬限制，pro 软阈值） |
| `cache:scenes:list` | JSON 全部活动场景列表 | 1 小时 | 主界面场景列表缓存（场景很少变） |
| `cache:companions:official` | JSON 全部官方角色 | 1 小时 | 官方角色列表缓存 |
| `rate:{user_id}:{minute}` | int | 5 分钟 | 速率限制（10 条/分钟） |
| `oauth:state:{state_id}` | 临时 OAuth state | 10 分钟 | 未来引入 OAuth 时用 |

---

## 5. R2 桶结构

```
xtbit-assets/
├── companions/
│   ├── official/{companion_id}.png   ← 官方角色立绘
│   └── user/{user_id}/{companion_id}.png ← 用户上传角色头像（可选）
├── scenes/
│   └── {scene_id}.png                ← 场景插图（横幅 1200×800）
└── llm-logs-archive/
    └── {YYYY-MM}/{batch_id}.jsonl.gz ← llm_logs 归档（30 天前）
```

**权限：**
- `companions/official/*`、`scenes/*` 公开可读（前端直接 URL 引用）
- `companions/user/*` 只有 owner 可访问（通过 Worker 签发 signed URL）
- `llm-logs-archive/*` 完全私有

---

## 6. 索引与查询模式（关键热路径）

| 查询场景 | 主表 + 索引 |
|---------|-----------|
| 用户登录查邮箱 | `users.email`（唯一索引） |
| 用户场景列表 | `scenes` + KV cache |
| 用户角色列表（官方 + 自创） | `companions` where `source='official' OR created_by=user_id` |
| 用户与某角色的对话历史 | `messages` where `thread_id=X` order by `created_at` desc limit 20 |
| 当前 thread 记忆注入 | `thread_memories` where `thread_id=X AND status='active'` order by `importance desc, updated_at desc` |
| 用户与某角色的关系数值 | `relationships`（主键 `user_id + companion_id`） |
| 用户订阅校验 | `billing_subscriptions` where `user_id=X AND status IN ('active','trialing') AND current_period_end > now()` |
| admin 看板：日成本 | `llm_logs` group by date |

---

## 7. Migration 策略

`packages/api/migrations/` 下，按编号 + 描述命名：

```
0001_initial_schema.sql        ← 全部基础表
0002_seed_admin_user.sql       ← 插入 admin@aiappsbox.com
0003_seed_llm_config.sql       ← 插入默认 LLM 配置
0004_seed_scenes_v1.sql        ← 插入 v1 8-10 个场景定义
0005_seed_official_companions_v1.sql ← 插入 v1 8-10 个官方角色
...
```

**运行方式：**
```bash
pnpm migrate:db:dev    # dev 环境
pnpm migrate:db:prod   # prod 环境（需要 admin 确认）
```

**回滚策略：** D1 不支持自动回滚。每个 migration 包含 `-- ROLLBACK:` 注释段，需手动执行。

---

## 8. 数据生命周期

| 数据 | 生命周期 |
|------|---------|
| `users` | 永久保留；用户删除账号 → 标记 `status='deleted'`（保留 30 天供恢复，之后真正删除及关联数据） |
| `messages` | 永久保留（核心产品价值） |
| `thread_memories` | 随 thread 保留；用户删除历史时应随 thread 重置策略一起清理或标记 inactive |
| `prompt_debug_snapshots` | dev/admin 诊断数据，prod 可关闭；开启时建议短期保留 |
| `events` | 永久保留 |
| `usage_log` | 永久保留（合规审计 / 财务） |
| `llm_logs` | 30 天后归档到 R2，原表清理 |
| `sessions` | 过期自动清理（cron job） |
| KV `quota:*` | TTL 90,000 秒自动清理 |

---

## 9. 与现有代码的关系

| 现有 | 对照 |
|------|------|
| `packages/api/migrations/` | 重新规划编号；保留现有 D1 schema 中"还有用"的部分（如 auth 相关） |
| 现有 `companion-engine.ts` 的 dimensions 系统 | 数据模型对应 §3.5 `relationships` 表（维度名重新对齐） |
| 现有 character cards | 数据模型对应 §3.3 `companions` 表（字段简化 + `source` 区分） |
| 现有 show-engine 的 chapter/scene state | 拆为 §3.6 `threads` + §3.7 `messages` + §3.8 `events`，去掉章节概念 |

具体迁移路径在 `specs/` 里分步定义。

---

## 10. 待最终敲定

- [ ] 维度数值是否允许超过 100（事件触发可能 +5，是否硬限 100）
- [ ] `messages.content` 是否要加密存储（敏感对话 / 用户隐私）
- [ ] 用户删号后数据保留时长（30 天合规？）
- [ ] `llm_logs` 归档触发时机（按时间 cron / 按表大小 / 按数量）
- [ ] 是否在 `users` 表加 `country` 字段（未来需要按区域计税 / 合规）
