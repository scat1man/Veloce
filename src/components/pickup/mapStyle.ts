import type { ExpressionSpecification, StyleSpecification } from 'maplibre-gl'

/**
 * The pickup map's look: a quiet night map drawn in the site's own ink, carbon
 * and stone, so the five hubs are the only bright things on it.
 *
 * Tiles come from OpenFreeMap (OpenStreetMap data in the OpenMapTiles schema):
 * free, no API key, and allowed on commercial sites. Its origin is listed in
 * the CSP's connect-src (server/security.js).
 */
export const TILE_ORIGIN = 'https://tiles.openfreemap.org'

const c = {
  land: '#141415',
  water: '#0b0b0c',
  park: '#171817',
  building: '#1c1c1d',
  minor: '#222223',
  major: '#2e2d2b',
  motorway: '#3b3a37',
  border: '#34332f',
  label: '#8d8b86',
  labelStrong: '#b9b7b1',
  halo: '#0b0b0c',
}

const name: ExpressionSpecification = ['coalesce', ['get', 'name:en'], ['get', 'name_en'], ['get', 'name']]
const font = ['Noto Sans Regular']

export const mapStyle: StyleSpecification = {
  version: 8,
  glyphs: `${TILE_ORIGIN}/fonts/{fontstack}/{range}.pbf`,
  sources: {
    omt: {
      type: 'vector',
      url: `${TILE_ORIGIN}/planet`,
      attribution:
        '<a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a> · <a href="https://www.openmaptiles.org/" target="_blank" rel="noopener">© OpenMapTiles</a> · Data from <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>',
    },
  },
  layers: [
    { id: 'land', type: 'background', paint: { 'background-color': c.land } },
    { id: 'park', type: 'fill', source: 'omt', 'source-layer': 'park', paint: { 'fill-color': c.park } },
    {
      id: 'landcover',
      type: 'fill',
      source: 'omt',
      'source-layer': 'landcover',
      filter: ['in', ['get', 'class'], ['literal', ['wood', 'grass', 'farmland']]],
      paint: { 'fill-color': c.park, 'fill-opacity': 0.6 },
    },
    { id: 'water', type: 'fill', source: 'omt', 'source-layer': 'water', paint: { 'fill-color': c.water } },
    {
      id: 'building',
      type: 'fill',
      source: 'omt',
      'source-layer': 'building',
      minzoom: 14,
      paint: { 'fill-color': c.building, 'fill-opacity': ['interpolate', ['linear'], ['zoom'], 14, 0, 15.5, 1] },
    },
    {
      id: 'road-minor',
      type: 'line',
      source: 'omt',
      'source-layer': 'transportation',
      minzoom: 11,
      filter: ['in', ['get', 'class'], ['literal', ['minor', 'service', 'tertiary']]],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': c.minor, 'line-width': ['interpolate', ['exponential', 1.5], ['zoom'], 11, 0.5, 16, 5] },
    },
    {
      id: 'road-major',
      type: 'line',
      source: 'omt',
      'source-layer': 'transportation',
      minzoom: 7,
      filter: ['in', ['get', 'class'], ['literal', ['primary', 'secondary', 'trunk']]],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': c.major, 'line-width': ['interpolate', ['exponential', 1.5], ['zoom'], 7, 0.5, 16, 8] },
    },
    {
      id: 'road-motorway',
      type: 'line',
      source: 'omt',
      'source-layer': 'transportation',
      minzoom: 5,
      filter: ['==', ['get', 'class'], 'motorway'],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': c.motorway, 'line-width': ['interpolate', ['exponential', 1.5], ['zoom'], 5, 0.4, 16, 10] },
    },
    {
      id: 'border-state',
      type: 'line',
      source: 'omt',
      'source-layer': 'boundary',
      filter: ['all', ['==', ['get', 'admin_level'], 4], ['!=', ['get', 'maritime'], 1]],
      paint: { 'line-color': c.border, 'line-width': 0.8, 'line-dasharray': [3, 2] },
    },
    {
      id: 'border-country',
      type: 'line',
      source: 'omt',
      'source-layer': 'boundary',
      filter: ['all', ['==', ['get', 'admin_level'], 2], ['!=', ['get', 'maritime'], 1]],
      paint: { 'line-color': c.border, 'line-width': 1.2 },
    },
    {
      id: 'road-name',
      type: 'symbol',
      source: 'omt',
      'source-layer': 'transportation_name',
      minzoom: 13,
      layout: { 'symbol-placement': 'line', 'text-field': name, 'text-font': font, 'text-size': 11 },
      paint: { 'text-color': c.label, 'text-halo-color': c.halo, 'text-halo-width': 1.2 },
    },
    {
      id: 'place-local',
      type: 'symbol',
      source: 'omt',
      'source-layer': 'place',
      minzoom: 10,
      filter: ['in', ['get', 'class'], ['literal', ['suburb', 'neighbourhood', 'quarter', 'town']]],
      layout: { 'text-field': name, 'text-font': font, 'text-size': 12, 'text-letter-spacing': 0.02 },
      paint: { 'text-color': c.label, 'text-halo-color': c.halo, 'text-halo-width': 1.2 },
    },
    {
      id: 'place-city',
      type: 'symbol',
      source: 'omt',
      'source-layer': 'place',
      minzoom: 5,
      filter: ['==', ['get', 'class'], 'city'],
      layout: { 'text-field': name, 'text-font': font, 'text-size': ['interpolate', ['linear'], ['zoom'], 5, 11, 10, 15] },
      paint: { 'text-color': c.labelStrong, 'text-halo-color': c.halo, 'text-halo-width': 1.4 },
    },
    {
      id: 'place-state',
      type: 'symbol',
      source: 'omt',
      'source-layer': 'place',
      maxzoom: 6,
      filter: ['==', ['get', 'class'], 'state'],
      layout: { 'text-field': name, 'text-font': font, 'text-size': 10, 'text-letter-spacing': 0.12, 'text-transform': 'uppercase' },
      paint: { 'text-color': c.label, 'text-opacity': 0.55, 'text-halo-color': c.halo, 'text-halo-width': 1 },
    },
  ],
}
