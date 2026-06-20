# Spec 041: Web Analytics Tracking v1

> 中文摘要：第一版只覆盖 Web 端核心漏斗，不接手机端。事件写入自家后端 `POST /analytics/events`，用于 Admin Analytics 的行为漏斗、关键事件计数和 Top Companion 汇总。埋点必须失败静默，不记录搜索原文、聊天内容、email、完整 URL、完整 referrer、IP、User-Agent 或用户自填 companion 文本。

## Goals

- Track the Web conversion path from public discovery to authentication, companion interest, chat, and billing intent.
- Preserve product reliability: analytics must never block navigation, chat, login, favorite toggles, or checkout.
- Preserve privacy by accepting only a small event-name and property allowlist.
- Keep native/mobile out of v1 while using event names that can be reused by mobile later.

## Architecture

- Web clients generate a persistent `anonymous_id` in `localStorage` and a rolling `session_id` in `sessionStorage`.
- Anonymous events prefer `navigator.sendBeacon`; authenticated events use `fetch(..., { keepalive: true })` with the existing bearer token so the API can bind `user_id`.
- The Worker handles `POST /analytics/events`, validates event names and properties, writes `analytics_events`, and treats invalid/expired auth as anonymous instead of failing the product flow.
- The scheduled Worker cleanup deletes event rows older than 180 days.
- `GET /admin/analytics/overview` returns a `behavior` block with funnel counts, key event counts, and Top Companion rows.

## Event Allowlist

| Event | Purpose | Allowed properties |
| --- | --- | --- |
| `web_page_viewed` | Web page exposure | `route_name`, `path_template`, `utm_source`, `utm_medium`, `utm_campaign`, `referrer_domain`, `landing_variant` |
| `discover_filter_changed` | Discovery filter/search clear/show-all actions | `filter_type`, `gender`, `tag`, `has_query`, `result_count` |
| `discover_search_performed` | Debounced discovery search | `query_length`, `has_query`, `gender`, `selected_tag`, `result_count` |
| `companion_card_clicked` | Discovery card click | `companion_id`, `source`, `gender`, `section`, `rank`, `card_position`, `is_authenticated` |
| `favorite_toggled` | Favorite/unfavorite result | `companion_id`, `source`, `gender`, `next_state`, `surface`, `result`, `error_code` |
| `landing_cta_clicked` | Advertising landing CTA click | `landing_variant`, `cta_id`, `destination` |
| `login_redirect_started` | Auth redirect from a gated action | `source_route`, `redirect_target`, `reason` |
| `auth_started` | Google/email auth button pressed | `method`, `redirect_target` |
| `auth_completed` | Auth success/failure | `method`, `result` |
| `companion_detail_action_clicked` | Detail page CTA | `companion_id`, `source`, `gender`, `action` |
| `chat_message_send_attempted` | User sends a normal chat message | `companion_id`, `chat_mode`, `scene_id`, `message_length_bucket` |
| `chat_message_send_completed` | Normal chat send result | `companion_id`, `chat_mode`, `scene_id`, `message_length_bucket`, `result`, `error_code`, `rate_limited`, `quota_blocked` |
| `billing_checkout_started` | Subscription, credit, or portal checkout intent | `checkout_type`, `credit_package_id`, `surface` |
| `billing_checkout_returned` | Billing success return | `status` |

## Privacy Rules

Do not add event fields that contain:

- raw search query text
- chat messages or generated replies
- email addresses
- full URLs, auth fragments, tokens, or magic links
- IP addresses or full User-Agent values
- companion greeting/personality/scenario/prompt or other user-authored profile text

Companion analytics may use structured product identifiers and enums only: `companion_id`, `source`, `gender`, `section`, `rank`, and `card_position`.

## Admin Reporting

The Admin Analytics behavior section uses the selected `today`, `7d`, or `30d` window.

- Funnel:
  - visitors: unique `anonymous_id`
  - authenticated users: unique `user_id`
  - companion clickers: unique `anonymous_id` with `companion_card_clicked`
  - chat starters: unique `anonymous_id` with detail `action = start_chat`
  - message senders: unique `anonymous_id` with `chat_message_send_completed`
  - checkout starters: unique `anonymous_id` with `billing_checkout_started`
- Key events:
  - page views
  - companion card clicks
  - favorites
  - chat attempts, successes, failures
  - checkout starts
- Top companions rank by chat starts, then clicks, then favorites.

## Rollout

- Production enables analytics by default.
- Local and dev builds stay off unless `EXPO_PUBLIC_ANALYTICS_ENABLED=1` or `true`.
- Future third-party analytics should be added behind the existing analytics client or backend pipeline without changing business components.
