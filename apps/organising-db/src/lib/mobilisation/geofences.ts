import type { GeofenceGeometry } from "./types";

/**
 * Approximate, editable polygons for the NW Australia offshore oil and gas
 * region. They cover the Carnarvon Basin / North West Shelf, the Browse
 * Basin, and the Bonaparte Basin / Timor Sea. Bass Strait and the Gippsland
 * Basin sit well south-east of every ring and are excluded. Organisers can
 * replace these from the watchlist page; the migration seeds the same rings.
 */
export const DEFAULT_GEOFENCES: {
  slug: string;
  name: string;
  description: string;
  geometry: GeofenceGeometry;
}[] = [
  {
    slug: "carnarvon-nws",
    name: "Carnarvon Basin / North West Shelf",
    description:
      "Commonwealth waters off the North West Cape through the North West Shelf, including the Exmouth Plateau approaches.",
    geometry: {
      type: "Polygon",
      coordinates: [
        [
          [112.2, -22.6],
          [112.2, -19.0],
          [114.5, -18.2],
          [116.8, -18.6],
          [117.2, -20.2],
          [115.8, -21.8],
          [114.0, -22.7],
          [112.2, -22.6],
        ],
      ],
    },
  },
  {
    slug: "browse",
    name: "Browse Basin",
    description: "Browse Basin offshore northern Western Australia.",
    geometry: {
      type: "Polygon",
      coordinates: [
        [
          [120.5, -15.8],
          [120.5, -12.8],
          [124.8, -12.8],
          [124.8, -15.2],
          [122.5, -16.2],
          [120.5, -15.8],
        ],
      ],
    },
  },
  {
    slug: "bonaparte-timor",
    name: "Bonaparte Basin / Timor Sea",
    description: "Bonaparte Basin and the Australian Timor Sea, offshore WA and the NT.",
    geometry: {
      type: "Polygon",
      coordinates: [
        [
          [126.0, -14.2],
          [125.2, -11.2],
          [128.5, -9.8],
          [131.8, -10.2],
          [132.2, -13.6],
          [129.0, -14.6],
          [126.0, -14.2],
        ],
      ],
    },
  },
];
