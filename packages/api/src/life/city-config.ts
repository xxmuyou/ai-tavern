import type { CityConfig } from "./types";

// v1 ships a single fixed city. v1.x will let users override via KV /
// preferences — keep this file as the single read point so future changes
// only touch one helper.
const AURELIA_CITY: CityConfig = {
  name: "Aurelia City",
  tagline: "A coastal city where every block hides a story.",
  description:
    "Aurelia is a temperate seaside city of cafés, neon-lit alleys, "
    + "rooftop bars and quiet bookstores. Spring rains, summer street "
    + "festivals, autumn leaves on the canal, snow on the harbour piers.",
};

export function getCityConfig(): CityConfig {
  return AURELIA_CITY;
}
