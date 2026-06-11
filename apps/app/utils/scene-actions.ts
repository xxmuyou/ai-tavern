import type { ChatLanguage } from '@/utils/chat-language';

export type SceneActionTone = 'positive' | 'neutral' | 'awkward' | 'negative' | 'romantic' | 'intimate';

export type SceneAction = {
  id: string;
  sceneId: string;
  labelEn: string;
  labelZh: string;
  tone: SceneActionTone;
};

export const SCENE_ACTIONS: readonly SceneAction[] = [
  action('central_station_plaza', 'plaza_attempt_hold_hands', 'Try holding hands', '尝试牵手', 'romantic'),
  action('central_station_plaza', 'plaza_take_photo', 'Take a photo', '拍照', 'positive'),
  action('pier_cafe', 'cafe_order_for_them', 'Order one for them', '给对方点一杯', 'positive'),
  action('pier_cafe', 'cafe_order_only_self', 'Order only for self', '只给自己点一杯', 'awkward'),
  action('restaurant', 'restaurant_expensive_order', 'Order expensive dishes', '点贵菜', 'positive'),
  action('restaurant', 'restaurant_cheap_order', 'Order cheap dishes', '点便宜菜', 'neutral'),
  action('restaurant', 'restaurant_pay_bill', 'Pay the bill', '买单', 'positive'),
  action('restaurant', 'restaurant_skip_bill', 'Skip the bill', '逃单', 'negative'),
  action('midnight_convenience_store', 'store_buy_water', 'Buy water', '买水', 'neutral'),
  action('midnight_convenience_store', 'store_buy_condoms', 'Buy condoms', '买避孕套', 'intimate'),
  action('rainlit_bookshop', 'bookshop_literature', 'Browse literature', '看文学类', 'positive'),
  action('rainlit_bookshop', 'bookshop_novels', 'Browse novels', '看小说类', 'positive'),
  action('rainlit_bookshop', 'bookshop_childrens', "Browse children's books", '看儿童类', 'neutral'),
  action('apartment_lobby', 'lobby_keep_distance', 'Keep distance', '保持距离', 'neutral'),
  action('apartment_lobby', 'lobby_attempt_hold_hands', 'Try holding hands', '试探牵手', 'romantic'),
  action('shared_laundry_room', 'laundry_help_wash', 'Help with laundry', '帮忙洗衣', 'positive'),
  action('shared_laundry_room', 'laundry_ask_help', 'Ask them to help', '让对方帮忙洗衣', 'neutral'),
  action('neighborhood_park', 'park_move_closer', 'Move closer', '靠近', 'romantic'),
  action('neighborhood_park', 'park_hold_hands', 'Hold hands', '牵手', 'romantic'),
  action('neighborhood_park', 'park_keep_distance', 'Keep distance', '保持距离', 'neutral'),
  action('creative_studio', 'studio_support_seriously', 'Support seriously', '认真支持', 'positive'),
  action('creative_studio', 'studio_brush_off', 'Brush it off', '随便敷衍', 'awkward'),
  action('indie_cinema', 'cinema_buy_popcorn', 'Buy popcorn', '买爆米花', 'positive'),
  action('indie_cinema', 'cinema_hold_hands', 'Hold hands', '牵手', 'romantic'),
  action('dessert_parlor', 'dessert_buy', 'Buy dessert', '买甜品', 'positive'),
  action('dessert_parlor', 'dessert_offer_used', 'Offer tasted dessert', '给对方自己吃过的甜品', 'awkward'),
  action('vinyl_record_shop', 'records_classical', 'Listen to classical', '听古典', 'positive'),
  action('vinyl_record_shop', 'records_pop', 'Listen to pop', '听流行', 'positive'),
  action('vinyl_record_shop', 'records_childrens', "Listen to children's songs", '听儿歌', 'neutral'),
  action('riverside_walk', 'riverside_hold_hands', 'Hold hands', '牵手', 'romantic'),
  action('riverside_walk', 'riverside_photo', 'Take a photo together', '合照', 'positive'),
  action('skyline_roof_garden', 'roof_kiss', 'Kiss', '亲吻', 'intimate'),
  action('skyline_roof_garden', 'roof_hug', 'Hug', '拥抱', 'romantic'),
  action('last_bus_stop', 'bus_goodbye_kiss', 'Goodbye kiss', '吻别', 'intimate'),
  action('last_bus_stop', 'bus_hug', 'Hug', '拥抱', 'romantic'),
  action('last_bus_stop', 'bus_ask_stay', 'Ask them to stay', '挽留', 'positive'),
  action('last_bus_stop', 'bus_say_goodbye', 'Say goodbye', '告别', 'neutral'),
  action('crescent_reading_room', 'library_pass_note', 'Pass a note', '递纸条', 'positive'),
  action('crescent_reading_room', 'library_make_noise', 'Make noise', '大声喧哗', 'negative'),
  action('rain_arcade', 'arcade_buy_gift', 'Buy a gift', '买礼物', 'positive'),
  action('rain_arcade', 'arcade_buy_clothes', 'Buy clothes', '买衣服', 'positive'),
  action('rain_arcade', 'arcade_buy_ring', 'Buy a ring', '买戒指', 'romantic'),
  action('iron_forge_gym', 'gym_offer_water', 'Offer water', '递水', 'positive'),
  action('iron_forge_gym', 'gym_spot_them', 'Spot them', '保护动作', 'positive'),
  action('iron_forge_gym', 'gym_show_muscles', 'Show muscles', '秀肌肉', 'neutral'),
  action('iron_forge_gym', 'gym_work_out', 'Work out', '锻炼', 'positive'),
  action('harbor_weekend_market', 'market_buy_snack', 'Buy snacks for them', '给对方买小吃', 'positive'),
  action('harbor_weekend_market', 'market_bargain', 'Bargain', '砍价', 'neutral'),
  action('harbor_weekend_market', 'market_carry_bags', 'Carry their bags', '帮对方拎东西', 'positive'),
  action('underground_livehouse', 'livehouse_order_drink', 'Order a drink', '点酒', 'neutral'),
  action('underground_livehouse', 'livehouse_drunk_scene', 'Act drunk', '发酒疯', 'negative'),
  action('underground_livehouse', 'livehouse_tipsy', 'Get tipsy', '微醺', 'neutral'),
  action('underground_livehouse', 'livehouse_dance', 'Dance', '跳舞', 'positive'),
  action('underground_livehouse', 'livehouse_skip_bill', 'Skip the bill', '逃单', 'negative'),
  action('neon_game_arcade', 'game_play', 'Play games', '玩游戏', 'positive'),
  action('neon_game_arcade', 'game_show_off', 'Show off', '炫耀', 'neutral'),
  action('neon_game_arcade', 'game_bet', 'Make a bet', '打赌', 'neutral'),
  action('neon_game_arcade', 'game_claw_machine', 'Claw machine', '夹娃娃', 'positive'),
  action('midnight_hotel_suite', 'hotel_touch', 'Gentle touch', '抚摸', 'intimate'),
  action('midnight_hotel_suite', 'hotel_sex', 'Spend the night together', '嘿咻', 'intimate'),
  action('midnight_hotel_suite', 'hotel_shower', 'Shower', '洗澡', 'intimate'),
  action('midnight_hotel_suite', 'hotel_bathroom', 'Use the bathroom', '上厕所', 'awkward'),
  action('midnight_hotel_suite', 'hotel_sleep_hug', 'Fall asleep holding each other', '深拥入眠', 'intimate'),
  action('private_apartment_bedroom', 'bedroom_sleep_hug', 'Fall asleep holding each other', '深拥入眠', 'intimate'),
  action('private_apartment_bedroom', 'bedroom_sex', 'Spend the night together', '嘿咻', 'intimate'),
  action('private_apartment_bedroom', 'bedroom_watch_movie', 'Watch a movie together', '一起看电影', 'positive'),
  action('rainfall_window_lounge', 'lounge_gaze', 'Look at them deeply', '深情看着对方', 'romantic'),
  action('rainfall_window_lounge', 'lounge_nap', 'Take a short nap', '小眯一会儿', 'positive'),
  action('dawn_balcony', 'balcony_hang_laundry', 'Hang laundry', '晒衣服', 'neutral'),
  action('dawn_balcony', 'balcony_collect_laundry', 'Collect laundry', '收衣服', 'neutral'),
];

export function sceneActionsFor(sceneId: string | null | undefined): SceneAction[] {
  if (!sceneId) return [];
  return SCENE_ACTIONS.filter((item) => item.sceneId === sceneId);
}

export function sceneActionLabel(action: SceneAction, language: ChatLanguage): string {
  return language === 'zh' ? action.labelZh : action.labelEn;
}

export function sceneActionText(action: SceneAction, language: ChatLanguage): string {
  const label = sceneActionLabel(action, language);
  if (language === 'zh') {
    return `<narration>你选择了动作：${label}。</narration>`;
  }
  return `<narration>You choose this action: ${label}.</narration>`;
}

export function customSceneActionText(text: string, language: ChatLanguage): string {
  if (language === 'zh') {
    return `<narration>你做了：${text}。</narration>`;
  }
  return `<narration>You do this: ${text}.</narration>`;
}

function action(
  sceneId: string,
  id: string,
  labelEn: string,
  labelZh: string,
  tone: SceneActionTone,
): SceneAction {
  return { id, labelEn, labelZh, sceneId, tone };
}
