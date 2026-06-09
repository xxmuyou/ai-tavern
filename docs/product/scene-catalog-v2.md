# Scene Catalog V2

> Canonical source for the V2 official scene catalog. V2 replaces the original
> 10-scene seed with 24 relationship-stage scenes for Aurelia City.

## Visual Standard

All scene images use this base direction:

> Japanese visual novel background art, anime dating sim BG, clean illustrated painted style, 16:9, no people, no text, no watermark, not photorealistic, not 3D, stable eye-level perspective, strong empty foreground and center-lower space for character sprite overlay, uncluttered composition.

Private and intimate scenes may show adult private spaces such as hotel suites,
bedrooms, beds, rain at night, and warm lamps. They must remain tasteful: no
people, nudity, sexual acts, explicit props, messy beds, or voyeur framing.

Default negative prompt:

> people, crowd, character, face, body, photorealistic, photo, live action, 3D render, CGI, fisheye, extreme wide angle, messy clutter, readable text, signage, logo, watermark, cropped foreground object, explicit sexual content, nudity

## Catalog

| Tier | Scene IDs |
|---|---|
| public | `central_station_plaza`, `pier_cafe`, `midnight_convenience_store`, `rainlit_bookshop` |
| familiar | `apartment_lobby`, `shared_laundry_room`, `neighborhood_park`, `creative_studio` |
| casual_date | `indie_cinema`, `dessert_parlor`, `vinyl_record_shop`, `riverside_walk` |
| emotional | `skyline_roof_garden`, `last_bus_stop`, `crescent_reading_room`, `rain_arcade` |
| active | `iron_forge_gym`, `harbor_weekend_market`, `underground_livehouse`, `neon_game_arcade` |
| intimate | `midnight_hotel_suite`, `private_apartment_bedroom`, `rainfall_window_lounge`, `dawn_balcony` |

## Scene Details

### `central_station_plaza`

- **id:** `central_station_plaza`
- **name:** Central Station Plaza
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
- **name:** Pier Cafe
- **tier:** public
- **tags:** `["cafe","waterfront","warm","day"]`
- **mood:** A small cafe at the end of the pier, warm enough for a first conversation and quiet enough to notice what someone does not say.
- **possible_events:** `["daily_encounter","invitation","gift"]`
- **default_companions:** `["maya","theo"]`
- **unlock_condition:** `null`
- **image_prompt:** Japanese visual novel background art, anime dating sim BG, clean illustrated painted style, 16:9, no people, no text, no watermark, not photorealistic, not 3D, stable eye-level perspective, strong empty foreground and center-lower space for character sprite overlay, uncluttered composition. A warm pier cafe interior at golden hour, ocean visible through broad windows, simple wooden counter to one side, soft curtains, coffee cups in the background, gentle seaside light.
- **negative_prompt:** people, crowd, character, face, body, photorealistic, photo, live action, 3D render, CGI, fisheye, extreme wide angle, messy clutter, readable text, signage, logo, watermark, cropped foreground object, explicit sexual content, nudity
- **composition_notes:** Counter and windows stay to the sides; reserve a clean center foreground for two standing sprites.

### `midnight_convenience_store`

- **id:** `midnight_convenience_store`
- **name:** Midnight Convenience Store
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
- **name:** Rainlit Bookshop
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
- **name:** Shared Laundry Room
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
- **name:** Neighborhood Park
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
- **name:** Creative Studio
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
- **name:** Indie Cinema
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
- **name:** Dessert Parlor
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
- **name:** Vinyl Record Shop
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
- **name:** Riverside Walk
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
- **name:** Skyline Roof Garden
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
- **name:** Last Bus Stop
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
- **name:** Crescent Reading Room
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
- **name:** Rain Arcade
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
- **name:** Iron Forge Gym
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
- **name:** Harbor Weekend Market
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
- **name:** Underground Livehouse
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
- **name:** Neon Game Arcade
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
- **name:** Midnight Hotel Suite
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
- **name:** Private Apartment Bedroom
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
- **name:** Rainfall Window Lounge
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
- **name:** Dawn Balcony
- **tier:** intimate
- **tags:** `["balcony","morning","intimate","quiet"]`
- **mood:** A dawn balcony after a long night, intimate because the city is waking before anyone is ready to speak.
- **possible_events:** `["confession","milestone"]`
- **default_companions:** `["maya","ryan","theo"]`
- **unlock_condition:** `{"type":"min_relationship","companion_id":"maya","dim":"trust","value":50}`
- **image_prompt:** Japanese visual novel background art, anime dating sim BG, clean illustrated painted style, 16:9, no people, no text, no watermark, not photorealistic, not 3D, stable eye-level perspective, strong empty foreground and center-lower space for character sprite overlay, uncluttered composition. A private apartment balcony at dawn, city skyline turning pale gold, sliding glass door, two simple chairs to one side, plants, quiet after-rain air, tender mature mood.
- **negative_prompt:** people, crowd, character, face, body, photorealistic, photo, live action, 3D render, CGI, fisheye, extreme wide angle, messy clutter, readable text, signage, logo, watermark, cropped foreground object, explicit sexual content, nudity
- **composition_notes:** Keep the balcony floor clear for sprites; avoid dramatic camera angles.

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
