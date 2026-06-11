# Scene Catalog V2

> Canonical source for the V2 official scene catalog. V2 replaces the original
> 10-scene seed with 25 relationship-stage scenes for Aurelia City.

## Visual Standard

All scene images use this base direction:

> Japanese visual novel background art, anime dating sim BG, clean illustrated painted style, 16:9, no people, no text, no watermark, not photorealistic, not 3D, stable eye-level perspective, strong empty foreground and center-lower space for character sprite overlay, uncluttered composition.

Private and intimate scenes may show adult private spaces such as hotel suites,
bedrooms, beds, rain at night, and warm lamps. They must remain tasteful: no
people, nudity, sexual acts, explicit props, messy beds, or voyeur framing.

Default negative prompt:

> people, crowd, character, face, body, photorealistic, photo, live action, 3D render, CGI, fisheye, extreme wide angle, messy clutter, readable text, signage, logo, watermark, cropped foreground object, explicit sexual content, nudity

## Catalog

Scene `name` values are deliberately plain place labels for UI scanning
(`Cafe`, `Restaurant`, `Hotel`). Atmosphere belongs in `mood`, image prompts,
and story beats rather than in the displayed name.

| Tier | Scene IDs |
|---|---|
| public | `central_station_plaza`, `pier_cafe`, `midnight_convenience_store`, `rainlit_bookshop` |
| familiar | `apartment_lobby`, `shared_laundry_room`, `neighborhood_park`, `creative_studio` |
| casual_date | `restaurant`, `indie_cinema`, `dessert_parlor`, `vinyl_record_shop`, `riverside_walk` |
| emotional | `skyline_roof_garden`, `last_bus_stop`, `crescent_reading_room`, `rain_arcade` |
| active | `iron_forge_gym`, `harbor_weekend_market`, `underground_livehouse`, `neon_game_arcade` |
| intimate | `midnight_hotel_suite`, `private_apartment_bedroom`, `rainfall_window_lounge`, `dawn_balcony` |

## Default Encounter Policy

Default daily-state encounters are intentionally narrower than the full scene
catalog. Because daily rule fields are cached globally by
`(companion_id, date_local, time_slot)`, default companion placement must not
depend on one user's relationship unlocks.

The current default encounter pool is limited to active, non-intimate scenes
with no `unlock_condition`:

`central_station_plaza`, `pier_cafe`, `midnight_convenience_store`,
`rainlit_bookshop`, `iron_forge_gym`, `rain_arcade`,
`harbor_weekend_market`.

Intimate scenes never appear through default random placement:
`midnight_hotel_suite`, `private_apartment_bedroom`,
`rainfall_window_lounge`, `dawn_balcony`.

Non-intimate scenes with an `unlock_condition` also stay out of default
placement. They remain available through explicit scene entry, in-chat
invitations, story transitions, and unlock CTA flows once the current user has
earned access. If daily state later becomes user-scoped, this policy can be
revisited.

## Scene Details

### `central_station_plaza`

- **id:** `central_station_plaza`
- **name:** Plaza
- **tier:** public
- **tags:** `["transit","city","public","day"]`
- **mood:** A bright station plaza where commuters, travelers, and chance meetings pass through the city without needing a reason to stay.
- **possible_events:** `["daily_encounter","invitation"]`
- **default_companions:** `["ryan","jordan"]`
- **unlock_condition:** `null`
- **image_prompt:** Japanese visual novel background art, anime dating sim BG, clean illustrated painted style, 16:9, no people, no text, no watermark, not photorealistic, not 3D, stable eye-level perspective, strong empty foreground and center-lower space for character sprite overlay, uncluttered composition. A modern coastal city station plaza in soft morning light, glass canopy, ticket gates in the distance, planters, clean paving, gentle urban energy.
- **negative_prompt:** people, crowd, character, face, body, photorealistic, photo, live action, 3D render, CGI, fisheye, extreme wide angle, messy clutter, readable text, signage, logo, watermark, cropped foreground object, explicit sexual content, nudity
- **composition_notes:** Keep the lower center open; station architecture should frame the background, not block character sprites.

### `pier_cafe`

- **id:** `pier_cafe`
- **name:** Cafe
- **tier:** public
- **tags:** `["cafe","waterfront","warm","day"]`
- **mood:** A small cafe at the end of the pier, warm enough for a first conversation and quiet enough to notice what someone does not say.
- **possible_events:** `["daily_encounter","invitation","gift"]`
- **default_companions:** `["maya","theo"]`
- **unlock_condition:** `null`
- **image_prompt:** Japanese visual novel background art, anime dating sim BG, clean illustrated painted style, 16:9, no people, no text, no watermark, not photorealistic, not 3D, stable eye-level perspective, strong empty foreground and center-lower space for character sprite overlay, uncluttered composition. A warm pier cafe interior at golden hour, ocean visible through broad windows, simple wooden counter to one side, soft curtains, coffee cups in the background, gentle seaside light.
- **negative_prompt:** people, crowd, character, face, body, photorealistic, photo, live action, 3D render, CGI, fisheye, extreme wide angle, messy clutter, readable text, signage, logo, watermark, cropped foreground object, explicit sexual content, nudity
- **composition_notes:** Counter and windows stay to the sides; reserve a clean center foreground for two standing sprites.

### `restaurant`

- **id:** `restaurant`
- **name:** Restaurant
- **tier:** casual_date
- **tags:** `["restaurant","date","dinner","indoor","evening"]`
- **mood:** A warm everyday restaurant with quiet tables, gentle evening light, and enough privacy for an easy dinner conversation without feeling secluded.
- **possible_events:** `["daily_encounter","gift","invitation","milestone"]`
- **default_companions:** `["maya","theo","ryan","iris"]`
- **unlock_condition:** `{"type":"min_relationship","companion_id":"maya","dim":"closeness","value":10}`
- **image_prompt:** Japanese visual novel background art, anime dating sim BG, clean illustrated painted style, 16:9, no people, no text, no watermark, not photorealistic, not 3D, stable eye-level perspective, strong empty foreground and center-lower space for character sprite overlay, uncluttered composition. A cozy everyday restaurant dining room in early evening, warm pendant lights, booth seating, small tables, plants, window light, inviting public date atmosphere, not private or luxury.
- **negative_prompt:** people, crowd, character, face, body, photorealistic, photo, live action, 3D render, CGI, fisheye, extreme wide angle, messy clutter, readable text, signage, logo, watermark, cropped foreground object, explicit sexual content, nudity
- **composition_notes:** Keep a clear center-lower area for character cutouts; avoid readable menus, logos, or signs.

### `midnight_convenience_store`

- **id:** `midnight_convenience_store`
- **name:** Convenience Store
- **tier:** public
- **tags:** `["night","errand","city","neon"]`
- **mood:** A fluorescent late-night shop where ordinary errands feel strangely honest under rain, vending machines, and quiet streets.
- **possible_events:** `["daily_encounter","gift","invitation"]`
- **default_companions:** `["lila","jordan"]`
- **unlock_condition:** `null`
- **image_prompt:** Japanese visual novel background art, anime dating sim BG, clean illustrated painted style, 16:9, no people, no text, no watermark, not photorealistic, not 3D, stable eye-level perspective, strong empty foreground and center-lower space for character sprite overlay, uncluttered composition. A quiet midnight convenience store entrance in light rain, glowing windows, vending machines, wet pavement reflecting soft color, shelves visible inside but not crowded.
- **negative_prompt:** people, crowd, character, face, body, photorealistic, photo, live action, 3D render, CGI, fisheye, extreme wide angle, messy clutter, readable text, signage, logo, watermark, cropped foreground object, explicit sexual content, nudity
- **composition_notes:** Avoid readable brand signs; use abstract light blocks for storefront details.

### `rainlit_bookshop`

- **id:** `rainlit_bookshop`
- **name:** Bookshop
- **tier:** public
- **tags:** `["bookshop","rain","quiet","indoor"]`
- **mood:** A narrow bookshop with rain on the glass and warm lamps between shelves, built for accidental recommendations and careful silences.
- **possible_events:** `["daily_encounter","gift","invitation"]`
- **default_companions:** `["maya","sora","aiko","theo"]`
- **unlock_condition:** `null`
- **image_prompt:** Japanese visual novel background art, anime dating sim BG, clean illustrated painted style, 16:9, no people, no text, no watermark, not photorealistic, not 3D, stable eye-level perspective, strong empty foreground and center-lower space for character sprite overlay, uncluttered composition. A cozy old bookshop on a rainy afternoon, warm reading lamps, shelves receding into the background, rain-streaked front window, small reading chair off to the side.
- **negative_prompt:** people, crowd, character, face, body, photorealistic, photo, live action, 3D render, CGI, fisheye, extreme wide angle, messy clutter, readable text, signage, logo, watermark, cropped foreground object, explicit sexual content, nudity
- **composition_notes:** Bookshelves should create depth; leave floor space uncluttered.

### `apartment_lobby`

- **id:** `apartment_lobby`
- **name:** Apartment Lobby
- **tier:** familiar
- **tags:** `["home","neighbor","evening","familiar"]`
- **mood:** The shared lobby of your apartment building, close enough to feel domestic without yet crossing into private life.
- **possible_events:** `["daily_encounter","gift","milestone"]`
- **default_companions:** `["iris"]`
- **unlock_condition:** `{"type":"min_relationship","companion_id":"iris","dim":"closeness","value":10}`
- **image_prompt:** Japanese visual novel background art, anime dating sim BG, clean illustrated painted style, 16:9, no people, no text, no watermark, not photorealistic, not 3D, stable eye-level perspective, strong empty foreground and center-lower space for character sprite overlay, uncluttered composition. A quiet modern apartment lobby at evening, mailboxes, elevator doors, indoor plants, warm ceiling lights, polished but lived-in residential atmosphere.
- **negative_prompt:** people, crowd, character, face, body, photorealistic, photo, live action, 3D render, CGI, fisheye, extreme wide angle, messy clutter, readable text, signage, logo, watermark, cropped foreground object, explicit sexual content, nudity
- **composition_notes:** Keep mailboxes and elevator in the rear or side; center floor stays open.

### `shared_laundry_room`

- **id:** `shared_laundry_room`
- **name:** Laundry Room
- **tier:** familiar
- **tags:** `["home","laundry","quiet","familiar"]`
- **mood:** A small residential laundry room where mundane chores turn into low-stakes honesty.
- **possible_events:** `["daily_encounter","gift"]`
- **default_companions:** `["iris","ryan"]`
- **unlock_condition:** `{"type":"min_relationship","companion_id":"iris","dim":"trust","value":10}`
- **image_prompt:** Japanese visual novel background art, anime dating sim BG, clean illustrated painted style, 16:9, no people, no text, no watermark, not photorealistic, not 3D, stable eye-level perspective, strong empty foreground and center-lower space for character sprite overlay, uncluttered composition. A clean shared apartment laundry room at night, washing machines along one wall, folded towels, soft fluorescent light, one small window with rain outside.
- **negative_prompt:** people, crowd, character, face, body, photorealistic, photo, live action, 3D render, CGI, fisheye, extreme wide angle, messy clutter, readable text, signage, logo, watermark, cropped foreground object, explicit sexual content, nudity
- **composition_notes:** Machines should line the sides; avoid baskets or objects in the sprite area.

### `neighborhood_park`

- **id:** `neighborhood_park`
- **name:** Park
- **tier:** familiar
- **tags:** `["park","outdoor","familiar","evening"]`
- **mood:** A small local park where familiar faces become easier to approach after the city slows down.
- **possible_events:** `["daily_encounter","invitation","milestone"]`
- **default_companions:** `["ethan","iris","ryan"]`
- **unlock_condition:** `{"type":"min_relationship","companion_id":"ethan","dim":"friendship","value":10}`
- **image_prompt:** Japanese visual novel background art, anime dating sim BG, clean illustrated painted style, 16:9, no people, no text, no watermark, not photorealistic, not 3D, stable eye-level perspective, strong empty foreground and center-lower space for character sprite overlay, uncluttered composition. A neighborhood park in soft evening light, path, benches, trees, small playground far in the background, calm residential skyline beyond.
- **negative_prompt:** people, crowd, character, face, body, photorealistic, photo, live action, 3D render, CGI, fisheye, extreme wide angle, messy clutter, readable text, signage, logo, watermark, cropped foreground object, explicit sexual content, nudity
- **composition_notes:** No joggers or families; preserve a clear path and open grass foreground.

### `creative_studio`

- **id:** `creative_studio`
- **name:** Studio
- **tier:** familiar
- **tags:** `["studio","work","creative","indoor"]`
- **mood:** A shared creative workspace with sketches, models, and late-afternoon light, made for careful ambition and unfinished thoughts.
- **possible_events:** `["daily_encounter","conflict","invitation"]`
- **default_companions:** `["maya","ryan","aiko"]`
- **unlock_condition:** `{"type":"min_relationship","companion_id":"maya","dim":"trust","value":10}`
- **image_prompt:** Japanese visual novel background art, anime dating sim BG, clean illustrated painted style, 16:9, no people, no text, no watermark, not photorealistic, not 3D, stable eye-level perspective, strong empty foreground and center-lower space for character sprite overlay, uncluttered composition. A modern creative studio with drafting tables, pinned abstract sketches without readable text, architecture models, warm late-afternoon window light.
- **negative_prompt:** people, crowd, character, face, body, photorealistic, photo, live action, 3D render, CGI, fisheye, extreme wide angle, messy clutter, readable text, signage, logo, watermark, cropped foreground object, explicit sexual content, nudity
- **composition_notes:** Put work tables at the edges; no dense foreground props.

### `indie_cinema`

- **id:** `indie_cinema`
- **name:** Cinema
- **tier:** casual_date
- **tags:** `["cinema","date","night","indoor"]`
- **mood:** A small independent cinema lobby after the trailers start, quiet enough for a first almost-date to become real.
- **possible_events:** `["daily_encounter","invitation","milestone"]`
- **default_companions:** `["theo","maya"]`
- **unlock_condition:** `{"type":"min_relationship","companion_id":"theo","dim":"romance","value":20}`
- **image_prompt:** Japanese visual novel background art, anime dating sim BG, clean illustrated painted style, 16:9, no people, no text, no watermark, not photorealistic, not 3D, stable eye-level perspective, strong empty foreground and center-lower space for character sprite overlay, uncluttered composition. A cozy indie cinema lobby at night, soft marquee-like lights without readable letters, red carpet, closed theater doors, posters blurred into abstract color blocks.
- **negative_prompt:** people, crowd, character, face, body, photorealistic, photo, live action, 3D render, CGI, fisheye, extreme wide angle, messy clutter, readable text, signage, logo, watermark, cropped foreground object, explicit sexual content, nudity
- **composition_notes:** Posters must not contain readable text; lobby should feel intimate but not crowded.

### `dessert_parlor`

- **id:** `dessert_parlor`
- **name:** Dessert Shop
- **tier:** casual_date
- **tags:** `["dessert","date","sweet","day"]`
- **mood:** A bright dessert shop where playful choices can turn into something softer.
- **possible_events:** `["daily_encounter","gift","invitation"]`
- **default_companions:** `["maya","iris","theo"]`
- **unlock_condition:** `{"type":"min_relationship","companion_id":"maya","dim":"romance","value":20}`
- **image_prompt:** Japanese visual novel background art, anime dating sim BG, clean illustrated painted style, 16:9, no people, no text, no watermark, not photorealistic, not 3D, stable eye-level perspective, strong empty foreground and center-lower space for character sprite overlay, uncluttered composition. A cheerful dessert parlor in afternoon light, pastel cakes behind glass in the background, round tables to the sides, soft warm colors, clean polished floor.
- **negative_prompt:** people, crowd, character, face, body, photorealistic, photo, live action, 3D render, CGI, fisheye, extreme wide angle, messy clutter, readable text, signage, logo, watermark, cropped foreground object, explicit sexual content, nudity
- **composition_notes:** Dessert display remains in the rear; avoid foreground chairs blocking sprites.

### `vinyl_record_shop`

- **id:** `vinyl_record_shop`
- **name:** Record Shop
- **tier:** casual_date
- **tags:** `["music","date","quiet","indoor"]`
- **mood:** A narrow record shop where taste becomes a flirtation and silence has rhythm.
- **possible_events:** `["daily_encounter","gift","invitation"]`
- **default_companions:** `["sora","jordan"]`
- **unlock_condition:** `{"type":"min_relationship","companion_id":"sora","dim":"closeness","value":20}`
- **image_prompt:** Japanese visual novel background art, anime dating sim BG, clean illustrated painted style, 16:9, no people, no text, no watermark, not photorealistic, not 3D, stable eye-level perspective, strong empty foreground and center-lower space for character sprite overlay, uncluttered composition. A quiet vinyl record shop with warm lamps, record bins along the walls, listening station in the background, rainy street visible through the window.
- **negative_prompt:** people, crowd, character, face, body, photorealistic, photo, live action, 3D render, CGI, fisheye, extreme wide angle, messy clutter, readable text, signage, logo, watermark, cropped foreground object, explicit sexual content, nudity
- **composition_notes:** Album covers should be abstract shapes, never readable or copyrighted-looking.

### `riverside_walk`

- **id:** `riverside_walk`
- **name:** Riverside
- **tier:** casual_date
- **tags:** `["riverside","date","outdoor","evening"]`
- **mood:** A river path at blue hour where conversation can keep moving when eye contact feels like too much.
- **possible_events:** `["daily_encounter","invitation","milestone"]`
- **default_companions:** `["ryan","marcus","iris"]`
- **unlock_condition:** `{"type":"min_relationship","companion_id":"ryan","dim":"closeness","value":20}`
- **image_prompt:** Japanese visual novel background art, anime dating sim BG, clean illustrated painted style, 16:9, no people, no text, no watermark, not photorealistic, not 3D, stable eye-level perspective, strong empty foreground and center-lower space for character sprite overlay, uncluttered composition. A quiet riverside walkway at blue hour, railing, water reflections, distant bridge lights, trees and benches to the side, calm city skyline.
- **negative_prompt:** people, crowd, character, face, body, photorealistic, photo, live action, 3D render, CGI, fisheye, extreme wide angle, messy clutter, readable text, signage, logo, watermark, cropped foreground object, explicit sexual content, nudity
- **composition_notes:** Path should lead into the background; keep center-lower walkway empty.

### `skyline_roof_garden`

- **id:** `skyline_roof_garden`
- **name:** Roof Garden
- **tier:** emotional
- **tags:** `["rooftop","night","honest","outdoor"]`
- **mood:** A roof garden above the city where distance makes honesty feel possible.
- **possible_events:** `["confession","milestone","invitation"]`
- **default_companions:** `["sora","marcus"]`
- **unlock_condition:** `{"type":"min_relationship","companion_id":"sora","dim":"closeness","value":30}`
- **image_prompt:** Japanese visual novel background art, anime dating sim BG, clean illustrated painted style, 16:9, no people, no text, no watermark, not photorealistic, not 3D, stable eye-level perspective, strong empty foreground and center-lower space for character sprite overlay, uncluttered composition. A night rooftop garden with city lights beyond glass railing, planters to the side, small path lights, cool wind mood, clear open terrace foreground.
- **negative_prompt:** people, crowd, character, face, body, photorealistic, photo, live action, 3D render, CGI, fisheye, extreme wide angle, messy clutter, readable text, signage, logo, watermark, cropped foreground object, explicit sexual content, nudity
- **composition_notes:** Avoid high-angle city panorama; keep eye-level terrace space for sprites.

### `last_bus_stop`

- **id:** `last_bus_stop`
- **name:** Bus Stop
- **tier:** emotional
- **tags:** `["night","transit","lonely","rain"]`
- **mood:** A late bus stop under streetlights, built for conversations people only admit when they are almost leaving.
- **possible_events:** `["daily_encounter","confession","invitation"]`
- **default_companions:** `["lila","marcus"]`
- **unlock_condition:** `{"type":"min_relationship","companion_id":"lila","dim":"trust","value":25}`
- **image_prompt:** Japanese visual novel background art, anime dating sim BG, clean illustrated painted style, 16:9, no people, no text, no watermark, not photorealistic, not 3D, stable eye-level perspective, strong empty foreground and center-lower space for character sprite overlay, uncluttered composition. A quiet last bus stop at night after rain, glowing shelter, wet road, distant bus lights, empty bench to one side, melancholic city atmosphere.
- **negative_prompt:** people, crowd, character, face, body, photorealistic, photo, live action, 3D render, CGI, fisheye, extreme wide angle, messy clutter, readable text, signage, logo, watermark, cropped foreground object, explicit sexual content, nudity
- **composition_notes:** The shelter should frame the side; no readable route maps.

### `crescent_reading_room`

- **id:** `crescent_reading_room`
- **name:** Library
- **tier:** emotional
- **tags:** `["library","quiet","study","indoor"]`
- **mood:** A crescent-shaped reading room where the quiet makes every question sound deliberate.
- **possible_events:** `["daily_encounter","gift","confession"]`
- **default_companions:** `["marcus","aiko"]`
- **unlock_condition:** `{"type":"min_relationship","companion_id":"marcus","dim":"trust","value":25}`
- **image_prompt:** Japanese visual novel background art, anime dating sim BG, clean illustrated painted style, 16:9, no people, no text, no watermark, not photorealistic, not 3D, stable eye-level perspective, strong empty foreground and center-lower space for character sprite overlay, uncluttered composition. A grand crescent-shaped library reading room, long tables in the background, warm desk lamps, high arched windows, quiet academic mood.
- **negative_prompt:** people, crowd, character, face, body, photorealistic, photo, live action, 3D render, CGI, fisheye, extreme wide angle, messy clutter, readable text, signage, logo, watermark, cropped foreground object, explicit sexual content, nudity
- **composition_notes:** Tables should not occupy the lower center; make space for standing characters.

### `rain_arcade`

- **id:** `rain_arcade`
- **name:** Shopping Arcade
- **tier:** emotional
- **tags:** `["arcade","rain","night","nostalgic"]`
- **mood:** A covered shopping arcade after rain, nostalgic and half-empty, where avoidance can finally run out.
- **possible_events:** `["daily_encounter","invitation","confession"]`
- **default_companions:** `["jordan","aiko"]`
- **unlock_condition:** `{"type":"min_relationship","companion_id":"jordan","dim":"closeness","value":25}`
- **image_prompt:** Japanese visual novel background art, anime dating sim BG, clean illustrated painted style, 16:9, no people, no text, no watermark, not photorealistic, not 3D, stable eye-level perspective, strong empty foreground and center-lower space for character sprite overlay, uncluttered composition. A covered city shopping arcade at night after rain, shuttered storefronts with abstract signs, puddle reflections, warm overhead lights, nostalgic quiet mood.
- **negative_prompt:** people, crowd, character, face, body, photorealistic, photo, live action, 3D render, CGI, fisheye, extreme wide angle, messy clutter, readable text, signage, logo, watermark, cropped foreground object, explicit sexual content, nudity
- **composition_notes:** Store signs must be unreadable color blocks; arcade corridor should create depth.

### `iron_forge_gym`

- **id:** `iron_forge_gym`
- **name:** Gym
- **tier:** active
- **tags:** `["gym","active","indoor","morning"]`
- **mood:** An old-school gym where effort is plain and encouragement can feel unexpectedly intimate.
- **possible_events:** `["daily_encounter","invitation"]`
- **default_companions:** `["ethan"]`
- **unlock_condition:** `null`
- **image_prompt:** Japanese visual novel background art, anime dating sim BG, clean illustrated painted style, 16:9, no people, no text, no watermark, not photorealistic, not 3D, stable eye-level perspective, strong empty foreground and center-lower space for character sprite overlay, uncluttered composition. An old-school training gym in cool morning light, weights and racks in the background, rubber floor, chalk marks, industrial windows, clean open workout space in front.
- **negative_prompt:** people, crowd, character, face, body, photorealistic, photo, live action, 3D render, CGI, fisheye, extreme wide angle, messy clutter, readable text, signage, logo, watermark, cropped foreground object, explicit sexual content, nudity
- **composition_notes:** Equipment stays behind the sprite area; no machines cutting through the foreground.

### `harbor_weekend_market`

- **id:** `harbor_weekend_market`
- **name:** Market
- **tier:** active
- **tags:** `["market","harbor","day","lively"]`
- **mood:** A bright harbor market where energy, food, and half-planned errands make it easy to wander together.
- **possible_events:** `["daily_encounter","gift","invitation"]`
- **default_companions:** `["jordan","lila","iris"]`
- **unlock_condition:** `null`
- **image_prompt:** Japanese visual novel background art, anime dating sim BG, clean illustrated painted style, 16:9, no people, no text, no watermark, not photorealistic, not 3D, stable eye-level perspective, strong empty foreground and center-lower space for character sprite overlay, uncluttered composition. A sunny harbor weekend market with colorful stalls in the background, sea and boats beyond, awnings, food carts, lively mood without any people.
- **negative_prompt:** people, crowd, character, face, body, photorealistic, photo, live action, 3D render, CGI, fisheye, extreme wide angle, messy clutter, readable text, signage, logo, watermark, cropped foreground object, explicit sexual content, nudity
- **composition_notes:** No crowd silhouettes; market liveliness comes from color and props.

### `underground_livehouse`

- **id:** `underground_livehouse`
- **name:** Livehouse
- **tier:** active
- **tags:** `["music","night","stage","active"]`
- **mood:** A small basement livehouse after soundcheck, loud even when empty.
- **possible_events:** `["daily_encounter","invitation","confession"]`
- **default_companions:** `["sora","lila","jordan"]`
- **unlock_condition:** `{"type":"min_relationship","companion_id":"sora","dim":"closeness","value":20}`
- **image_prompt:** Japanese visual novel background art, anime dating sim BG, clean illustrated painted style, 16:9, no people, no text, no watermark, not photorealistic, not 3D, stable eye-level perspective, strong empty foreground and center-lower space for character sprite overlay, uncluttered composition. A small underground livehouse after soundcheck, low stage in the background, colored lights, instruments resting on stands, dark walls, intimate music venue mood.
- **negative_prompt:** people, crowd, character, face, body, photorealistic, photo, live action, 3D render, CGI, fisheye, extreme wide angle, messy clutter, readable text, signage, logo, watermark, cropped foreground object, explicit sexual content, nudity
- **composition_notes:** Stage and instruments remain background elements; foreground is open floor.

### `neon_game_arcade`

- **id:** `neon_game_arcade`
- **name:** Game Arcade
- **tier:** active
- **tags:** `["arcade","playful","night","active"]`
- **mood:** A neon arcade where competitive jokes make room for braver feelings.
- **possible_events:** `["daily_encounter","invitation","gift"]`
- **default_companions:** `["ethan","jordan","ryan"]`
- **unlock_condition:** `{"type":"min_relationship","companion_id":"jordan","dim":"friendship","value":15}`
- **image_prompt:** Japanese visual novel background art, anime dating sim BG, clean illustrated painted style, 16:9, no people, no text, no watermark, not photorealistic, not 3D, stable eye-level perspective, strong empty foreground and center-lower space for character sprite overlay, uncluttered composition. A clean neon game arcade at night, cabinets along the walls, soft colorful glow, prize counter in the background with no readable labels, playful energy.
- **negative_prompt:** people, crowd, character, face, body, photorealistic, photo, live action, 3D render, CGI, fisheye, extreme wide angle, messy clutter, readable text, signage, logo, watermark, cropped foreground object, explicit sexual content, nudity
- **composition_notes:** Avoid over-saturated neon; arcade cabinets must not crowd the center.

### `midnight_hotel_suite`

- **id:** `midnight_hotel_suite`
- **name:** Hotel
- **tier:** intimate
- **tags:** `["hotel","bedroom","intimate","night"]`
- **mood:** A quiet hotel suite at midnight where city rain and private space make every pause feel deliberate.
- **possible_events:** `["confession","milestone"]`
- **default_companions:** `["lila","sora"]`
- **unlock_condition:** `{"type":"min_relationship","companion_id":"lila","dim":"romance","value":60}`
- **image_prompt:** Japanese visual novel background art, anime dating sim BG, clean illustrated painted style, 16:9, no people, no text, no watermark, not photorealistic, not 3D, stable eye-level perspective, strong empty foreground and center-lower space for character sprite overlay, uncluttered composition. A tasteful upscale hotel suite bedroom at midnight, neatly made bed to one side, rain-streaked window, distant city lights, warm lamps, mature romantic atmosphere.
- **negative_prompt:** people, crowd, character, face, body, photorealistic, photo, live action, 3D render, CGI, fisheye, extreme wide angle, messy clutter, readable text, signage, logo, watermark, cropped foreground object, explicit sexual content, nudity, messy bed, lingerie, voyeur angle
- **composition_notes:** Bed may be visible but tidy and off-center; the sprite area remains clean and non-explicit.

### `private_apartment_bedroom`

- **id:** `private_apartment_bedroom`
- **name:** Bedroom
- **tier:** intimate
- **tags:** `["home","bedroom","intimate","night"]`
- **mood:** A private bedroom that feels lived-in and trusted, more vulnerable than dramatic.
- **possible_events:** `["confession","milestone","gift"]`
- **default_companions:** `["theo","iris","maya"]`
- **unlock_condition:** `{"type":"min_relationship","companion_id":"theo","dim":"romance","value":60}`
- **image_prompt:** Japanese visual novel background art, anime dating sim BG, clean illustrated painted style, 16:9, no people, no text, no watermark, not photorealistic, not 3D, stable eye-level perspective, strong empty foreground and center-lower space for character sprite overlay, uncluttered composition. A cozy private apartment bedroom at night, neatly made bed, bedside lamp, books and soft curtains, warm safe atmosphere, gentle city light through the window.
- **negative_prompt:** people, crowd, character, face, body, photorealistic, photo, live action, 3D render, CGI, fisheye, extreme wide angle, messy clutter, readable text, signage, logo, watermark, cropped foreground object, explicit sexual content, nudity, messy bed, lingerie, voyeur angle
- **composition_notes:** Keep intimacy emotional; bedroom details should be soft and tidy.

### `rainfall_window_lounge`

- **id:** `rainfall_window_lounge`
- **name:** Lounge
- **tier:** intimate
- **tags:** `["lounge","rain","intimate","night"]`
- **mood:** A private window lounge with rain against the glass, built for sitting close and saying less.
- **possible_events:** `["confession","milestone"]`
- **default_companions:** `["sora","marcus","aiko"]`
- **unlock_condition:** `{"type":"min_relationship","companion_id":"sora","dim":"romance","value":45}`
- **image_prompt:** Japanese visual novel background art, anime dating sim BG, clean illustrated painted style, 16:9, no people, no text, no watermark, not photorealistic, not 3D, stable eye-level perspective, strong empty foreground and center-lower space for character sprite overlay, uncluttered composition. A private high-rise window lounge at night, rain on tall glass, low sofa to the side, small table, city lights blurred beyond, soft amber floor lamp, mature quiet mood.
- **negative_prompt:** people, crowd, character, face, body, photorealistic, photo, live action, 3D render, CGI, fisheye, extreme wide angle, messy clutter, readable text, signage, logo, watermark, cropped foreground object, explicit sexual content, nudity, messy bed, lingerie, voyeur angle
- **composition_notes:** Sofa stays side-weighted; no body-shaped blankets or suggestive clutter.

### `dawn_balcony`

- **id:** `dawn_balcony`
- **name:** Balcony
- **tier:** intimate
- **tags:** `["balcony","morning","intimate","quiet"]`
- **mood:** A dawn balcony after a long night, intimate because the city is waking before anyone is ready to speak.
- **possible_events:** `["confession","milestone"]`
- **default_companions:** `["maya","ryan","theo"]`
- **unlock_condition:** `{"type":"min_relationship","companion_id":"maya","dim":"trust","value":50}`
- **image_prompt:** Japanese visual novel background art, anime dating sim BG, clean illustrated painted style, 16:9, no people, no text, no watermark, not photorealistic, not 3D, stable eye-level perspective, strong empty foreground and center-lower space for character sprite overlay, uncluttered composition. A private apartment balcony at dawn, city skyline turning pale gold, sliding glass door, two simple chairs to one side, plants, quiet after-rain air, tender mature mood.
- **negative_prompt:** people, crowd, character, face, body, photorealistic, photo, live action, 3D render, CGI, fisheye, extreme wide angle, messy clutter, readable text, signage, logo, watermark, cropped foreground object, explicit sexual content, nudity
- **composition_notes:** Keep the balcony floor clear for sprites; avoid dramatic camera angles.

## Scene Action Catalog

Scene actions are Web chat quick actions scoped to the current scene. They are
validated server-side by `scene_id + action_id`, persisted as quick-action
activity metadata, and injected into chat as the user's visible gesture. Negative
actions should create awkward or trust-damaging consequences. Intimate actions
must keep consent explicit and avoid graphic sexual or private bodily detail.

Web chat also supports one-off custom scene actions. These are entered by the
user from the current scene's Action menu and sent as
`{ "type": "custom_scene_action", "text": "..." }`. A custom action is not saved
back into this catalog and does not become a reusable button; it only happens in
that chat turn. The backend trims the text, requires a current scene, caps it at
120 characters, persists it in quick-action metadata, and injects it into the LLM
prompt as a visible user action that just happened in the scene. Custom actions
do not apply a fixed relationship delta because free text is too ambiguous to
score safely; the companion reply and normal relationship signal extraction carry
the emotional consequence. If the model provider rejects the content, the client
should show a clear content rejection message rather than treating it as a server
outage.

| Scene | Actions |
|---|---|
| `central_station_plaza` | 尝试牵手、拍照 |
| `pier_cafe` | 给对方点一杯、只给自己点一杯 |
| `restaurant` | 点贵菜、点便宜菜、买单、逃单 |
| `midnight_convenience_store` | 买水、买避孕套 |
| `rainlit_bookshop` | 看文学类、看小说类、看儿童类 |
| `apartment_lobby` | 保持距离、试探牵手 |
| `shared_laundry_room` | 帮忙洗衣、让对方帮忙洗衣 |
| `neighborhood_park` | 靠近、牵手、保持距离 |
| `creative_studio` | 认真支持、随便敷衍 |
| `indie_cinema` | 买爆米花、牵手 |
| `dessert_parlor` | 买甜品、给对方自己吃过的甜品 |
| `vinyl_record_shop` | 听古典、听流行、听儿歌 |
| `riverside_walk` | 牵手、合照 |
| `skyline_roof_garden` | 亲吻、拥抱 |
| `last_bus_stop` | 吻别、拥抱、挽留、告别 |
| `crescent_reading_room` | 递纸条、大声喧哗 |
| `rain_arcade` | 买礼物、买衣服、买戒指 |
| `iron_forge_gym` | 递水、保护动作、秀肌肉、锻炼 |
| `harbor_weekend_market` | 给对方买小吃、砍价、帮对方拎东西 |
| `underground_livehouse` | 点酒、发酒疯、微醺、跳舞、逃单 |
| `neon_game_arcade` | 玩游戏、炫耀、打赌、夹娃娃 |
| `midnight_hotel_suite` | 抚摸、嘿咻、洗澡、上厕所、深拥入眠 |
| `private_apartment_bedroom` | 深拥入眠、嘿咻、一起看电影 |
| `rainfall_window_lounge` | 深情看着对方、小眯一会儿 |
| `dawn_balcony` | 晒衣服、收衣服 |

## Official Companion Scene Mapping

| Companion | Preferred scenes |
|---|---|
| Maya | `pier_cafe`, `rainlit_bookshop`, `creative_studio` |
| Ryan | `central_station_plaza`, `creative_studio`, `riverside_walk` |
| Lila | `midnight_convenience_store`, `underground_livehouse`, `last_bus_stop` |
| Ethan | `iron_forge_gym`, `neighborhood_park`, `neon_game_arcade` |
| Sora | `vinyl_record_shop`, `skyline_roof_garden`, `underground_livehouse` |
| Marcus | `crescent_reading_room`, `skyline_roof_garden`, `last_bus_stop` |
| Aiko | `creative_studio`, `rainlit_bookshop`, `crescent_reading_room` |
| Jordan | `harbor_weekend_market`, `rain_arcade`, `neon_game_arcade` |
| Iris | `apartment_lobby`, `shared_laundry_room`, `neighborhood_park` |
| Theo | `pier_cafe`, `rainlit_bookshop`, `indie_cinema` |

## Migration Notes

- V1 scene rows stay in the database for historical references but become
  inactive, except `iron_forge_gym`, whose ID is intentionally reused by V2.
- V2 rows use `art_url = "scenes/<scene_id>.png"`.
- App-local asset mappings should be updated only after approved image files
  exist in `apps/app/assets/ai-companion/scenes/`.
