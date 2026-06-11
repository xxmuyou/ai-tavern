import type { DimensionValues } from "../relationships/level";

export const SCENE_ACTION_TONES = ["positive", "neutral", "awkward", "negative", "romantic", "intimate"] as const;
export type SceneActionTone = (typeof SCENE_ACTION_TONES)[number];

export type SceneActionDefinition = {
  id: string;
  scene_id: string;
  label_en: string;
  label_zh: string;
  description: string;
  tone: SceneActionTone;
  delta: Partial<DimensionValues>;
};

const positive = { closeness: 1, trust: 1 } satisfies Partial<DimensionValues>;
const caring = { closeness: 1, trust: 2 } satisfies Partial<DimensionValues>;
const romantic = { closeness: 1, romance: 2, tension: -1 } satisfies Partial<DimensionValues>;
const intimate = { closeness: 1, romance: 2, tension: 1, trust: 1 } satisfies Partial<DimensionValues>;
const playful = { closeness: 1, tension: 1 } satisfies Partial<DimensionValues>;
const awkward = { tension: 2, trust: -1 } satisfies Partial<DimensionValues>;
const negative = { closeness: -1, tension: 3, trust: -3 } satisfies Partial<DimensionValues>;

export const SCENE_ACTIONS: readonly SceneActionDefinition[] = [
  action("central_station_plaza", "plaza_attempt_hold_hands", "Try holding hands", "尝试牵手", "The user tentatively tries to hold your hand in the open plaza.", "romantic", romantic),
  action("central_station_plaza", "plaza_take_photo", "Take a photo", "拍照", "The user suggests taking a photo together in the plaza.", "positive", positive),
  action("pier_cafe", "cafe_order_for_them", "Order one for them", "给对方点一杯", "The user thoughtfully orders a drink for you.", "positive", caring),
  action("pier_cafe", "cafe_order_only_self", "Order only for self", "只给自己点一杯", "The user orders a drink only for themselves and leaves you out.", "awkward", awkward),
  action("restaurant", "restaurant_expensive_order", "Order expensive dishes", "点贵菜", "The user confidently orders expensive dishes for the table.", "positive", playful),
  action("restaurant", "restaurant_cheap_order", "Order cheap dishes", "点便宜菜", "The user chooses cheaper dishes and keeps the meal restrained.", "neutral", positive),
  action("restaurant", "restaurant_pay_bill", "Pay the bill", "买单", "The user pays the bill before you can worry about it.", "positive", caring),
  action("restaurant", "restaurant_skip_bill", "Skip the bill", "逃单", "The user tries to leave without paying the restaurant bill.", "negative", negative),
  action("midnight_convenience_store", "store_buy_water", "Buy water", "买水", "The user buys water during this late-night stop.", "neutral", positive),
  action("midnight_convenience_store", "store_buy_condoms", "Buy condoms", "买避孕套", "The user buys condoms; handle the implication with boundaries, consent, and no explicit sexual detail.", "intimate", intimate),
  action("rainlit_bookshop", "bookshop_literature", "Browse literature", "看文学类", "The user browses the literature shelves with you.", "positive", positive),
  action("rainlit_bookshop", "bookshop_novels", "Browse novels", "看小说类", "The user heads to the novel shelves with you.", "positive", positive),
  action("rainlit_bookshop", "bookshop_childrens", "Browse children's books", "看儿童类", "The user unexpectedly browses the children's books section.", "neutral", playful),
  action("apartment_lobby", "lobby_keep_distance", "Keep distance", "保持距离", "The user consciously keeps a respectful distance in the apartment lobby.", "neutral", { trust: 1, tension: -1 }),
  action("apartment_lobby", "lobby_attempt_hold_hands", "Try holding hands", "试探牵手", "The user cautiously tests whether holding hands would feel okay.", "romantic", romantic),
  action("shared_laundry_room", "laundry_help_wash", "Help with laundry", "帮忙洗衣", "The user helps you with the laundry.", "positive", caring),
  action("shared_laundry_room", "laundry_ask_help", "Ask them to help", "让对方帮忙洗衣", "The user asks you to help with their laundry.", "neutral", playful),
  action("neighborhood_park", "park_move_closer", "Move closer", "靠近", "The user gently moves closer while you spend time in the park.", "romantic", romantic),
  action("neighborhood_park", "park_hold_hands", "Hold hands", "牵手", "The user reaches for your hand in the park.", "romantic", romantic),
  action("neighborhood_park", "park_keep_distance", "Keep distance", "保持距离", "The user keeps a little distance while walking with you.", "neutral", { trust: 1, tension: -1 }),
  action("creative_studio", "studio_support_seriously", "Support seriously", "认真支持", "The user takes your work seriously and offers sincere support.", "positive", caring),
  action("creative_studio", "studio_brush_off", "Brush it off", "随便敷衍", "The user gives a careless, half-hearted response to your work.", "awkward", awkward),
  action("indie_cinema", "cinema_buy_popcorn", "Buy popcorn", "买爆米花", "The user buys popcorn for the movie.", "positive", positive),
  action("indie_cinema", "cinema_hold_hands", "Hold hands", "牵手", "The user reaches for your hand during the movie.", "romantic", romantic),
  action("dessert_parlor", "dessert_buy", "Buy dessert", "买甜品", "The user buys dessert to share this sweet moment.", "positive", positive),
  action("dessert_parlor", "dessert_offer_used", "Offer tasted dessert", "给对方自己吃过的甜品", "The user offers you dessert they have already tasted.", "awkward", playful),
  action("vinyl_record_shop", "records_classical", "Listen to classical", "听古典", "The user chooses classical music to listen to with you.", "positive", positive),
  action("vinyl_record_shop", "records_pop", "Listen to pop", "听流行", "The user chooses pop music to listen to with you.", "positive", playful),
  action("vinyl_record_shop", "records_childrens", "Listen to children's songs", "听儿歌", "The user chooses children's songs, making the moment unexpectedly silly.", "neutral", playful),
  action("riverside_walk", "riverside_hold_hands", "Hold hands", "牵手", "The user holds your hand by the riverside.", "romantic", romantic),
  action("riverside_walk", "riverside_photo", "Take a photo together", "合照", "The user suggests taking a photo together by the river.", "positive", positive),
  action("skyline_roof_garden", "roof_kiss", "Kiss", "亲吻", "The user leans into a kiss; let consent and the relationship decide how you respond.", "intimate", intimate),
  action("skyline_roof_garden", "roof_hug", "Hug", "拥抱", "The user opens their arms for a hug under the skyline.", "romantic", romantic),
  action("last_bus_stop", "bus_goodbye_kiss", "Goodbye kiss", "吻别", "The user tries to say goodbye with a kiss; respond according to your feelings and boundaries.", "intimate", intimate),
  action("last_bus_stop", "bus_hug", "Hug", "拥抱", "The user hugs you at the bus stop.", "romantic", romantic),
  action("last_bus_stop", "bus_ask_stay", "Ask them to stay", "挽留", "The user asks you not to leave yet.", "positive", { closeness: 1, romance: 1, tension: 1 }),
  action("last_bus_stop", "bus_say_goodbye", "Say goodbye", "告别", "The user chooses to say goodbye for now.", "neutral", { trust: 1, tension: -1 }),
  action("crescent_reading_room", "library_pass_note", "Pass a note", "递纸条", "The user quietly passes you a note in the library.", "positive", playful),
  action("crescent_reading_room", "library_make_noise", "Make noise", "大声喧哗", "The user speaks loudly in the quiet library.", "negative", negative),
  action("rain_arcade", "arcade_buy_gift", "Buy a gift", "买礼物", "The user buys you a small gift while shopping.", "positive", caring),
  action("rain_arcade", "arcade_buy_clothes", "Buy clothes", "买衣服", "The user suggests buying clothes together.", "positive", positive),
  action("rain_arcade", "arcade_buy_ring", "Buy a ring", "买戒指", "The user looks at rings with you, making the moment feel serious.", "romantic", { closeness: 1, romance: 3, tension: 1 }),
  action("iron_forge_gym", "gym_offer_water", "Offer water", "递水", "The user offers you water during the workout.", "positive", caring),
  action("iron_forge_gym", "gym_spot_them", "Spot them", "保护动作", "The user carefully spots you during exercise.", "positive", caring),
  action("iron_forge_gym", "gym_show_muscles", "Show muscles", "秀肌肉", "The user shows off a little at the gym.", "neutral", playful),
  action("iron_forge_gym", "gym_work_out", "Work out", "锻炼", "The user gets serious about exercising with you.", "positive", positive),
  action("harbor_weekend_market", "market_buy_snack", "Buy snacks for them", "给对方买小吃", "The user buys you a snack at the market.", "positive", caring),
  action("harbor_weekend_market", "market_bargain", "Bargain", "砍价", "The user tries to bargain at the market stall.", "neutral", playful),
  action("harbor_weekend_market", "market_carry_bags", "Carry their bags", "帮对方拎东西", "The user helps carry your things at the market.", "positive", caring),
  action("underground_livehouse", "livehouse_order_drink", "Order a drink", "点酒", "The user orders a drink at the livehouse.", "neutral", playful),
  action("underground_livehouse", "livehouse_drunk_scene", "Act drunk", "发酒疯", "The user loses control after drinking and makes the moment uncomfortable.", "negative", negative),
  action("underground_livehouse", "livehouse_tipsy", "Get tipsy", "微醺", "The user becomes tipsy but keeps the mood light.", "neutral", playful),
  action("underground_livehouse", "livehouse_dance", "Dance", "跳舞", "The user starts dancing with the music.", "positive", { closeness: 1, romance: 1, tension: 1 }),
  action("underground_livehouse", "livehouse_skip_bill", "Skip the bill", "逃单", "The user tries to leave without paying.", "negative", negative),
  action("neon_game_arcade", "game_play", "Play games", "玩游戏", "The user plays arcade games with you.", "positive", positive),
  action("neon_game_arcade", "game_show_off", "Show off", "炫耀", "The user boasts after playing well.", "neutral", playful),
  action("neon_game_arcade", "game_bet", "Make a bet", "打赌", "The user makes a playful bet with you.", "neutral", playful),
  action("neon_game_arcade", "game_claw_machine", "Claw machine", "夹娃娃", "The user tries the claw machine with you.", "positive", playful),
  action("midnight_hotel_suite", "hotel_touch", "Gentle touch", "抚摸", "The user initiates gentle touch; keep consent explicit and do not write explicit sexual detail.", "intimate", intimate),
  action("midnight_hotel_suite", "hotel_sex", "Spend the night together", "嘿咻", "The user suggests sex; only proceed if the relationship, mood, and your consent make sense, and fade to black rather than describing explicit acts.", "intimate", intimate),
  action("midnight_hotel_suite", "hotel_shower", "Shower", "洗澡", "The user suggests showering; handle it privately, respectfully, and without explicit detail.", "intimate", intimate),
  action("midnight_hotel_suite", "hotel_bathroom", "Use the bathroom", "上厕所", "The user brings up using the bathroom; keep it brief, private, and not erotic.", "awkward", awkward),
  action("midnight_hotel_suite", "hotel_sleep_hug", "Fall asleep holding each other", "深拥入眠", "The user wants to fall asleep holding you close.", "intimate", intimate),
  action("private_apartment_bedroom", "bedroom_sleep_hug", "Fall asleep holding each other", "深拥入眠", "The user wants to fall asleep holding you close in the bedroom.", "intimate", intimate),
  action("private_apartment_bedroom", "bedroom_sex", "Spend the night together", "嘿咻", "The user suggests sex; only proceed with clear consent and fade to black rather than describing explicit acts.", "intimate", intimate),
  action("private_apartment_bedroom", "bedroom_watch_movie", "Watch a movie together", "一起看电影", "The user suggests watching a movie together in the bedroom.", "positive", { closeness: 1, romance: 1 }),
  action("rainfall_window_lounge", "lounge_gaze", "Look at them deeply", "深情看着对方", "The user looks at you with quiet affection.", "romantic", romantic),
  action("rainfall_window_lounge", "lounge_nap", "Take a short nap", "小眯一会儿", "The user suggests resting for a short nap.", "positive", { closeness: 1, tension: -1, trust: 1 }),
  action("dawn_balcony", "balcony_hang_laundry", "Hang laundry", "晒衣服", "The user hangs laundry on the balcony with you.", "neutral", positive),
  action("dawn_balcony", "balcony_collect_laundry", "Collect laundry", "收衣服", "The user collects laundry from the balcony with you.", "neutral", positive),
];

export function findSceneAction(sceneId: string, actionId: string): SceneActionDefinition | null {
  return SCENE_ACTIONS.find((item) => item.scene_id === sceneId && item.id === actionId) ?? null;
}

function action(
  sceneId: string,
  id: string,
  labelEn: string,
  labelZh: string,
  description: string,
  tone: SceneActionTone,
  delta: Partial<DimensionValues>,
): SceneActionDefinition {
  return {
    delta,
    description,
    id,
    label_en: labelEn,
    label_zh: labelZh,
    scene_id: sceneId,
    tone,
  };
}
