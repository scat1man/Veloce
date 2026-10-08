export type Location = {
  id: string
  city: string
  state: string
  timeZone: string
  hub: string
  route: string
  radius: string
  note: string
  /** Where the cars are kept and can be collected, [longitude, latitude]. */
  pickup: [number, number]
}

export const locations: Location[] = [
  {
    id: 'la',
    city: 'Los Angeles',
    state: 'CA',
    timeZone: 'America/Los_Angeles',
    hub: 'Beverly Hills',
    route: 'Angeles Crest Highway',
    radius: '60 mi',
    note: 'Our flagship. Canyon roads at dawn, the Pacific Coast Highway by golden hour.',
    pickup: [-118.4004, 34.0736],
  },
  {
    id: 'mia',
    city: 'Miami',
    state: 'FL',
    timeZone: 'America/New_York',
    hub: 'Miami Beach',
    route: 'Overseas Highway',
    radius: '45 mi',
    note: 'Ocean Drive after dark, then south over open water toward the Keys.',
    pickup: [-80.13, 25.7907],
  },
  {
    id: 'las',
    city: 'Las Vegas',
    state: 'NV',
    timeZone: 'America/Los_Angeles',
    hub: 'The Strip',
    route: 'Valley of Fire Highway',
    radius: '50 mi',
    note: 'Neon to red rock in forty minutes. The desert rewards an early start.',
    pickup: [-115.1728, 36.1147],
  },
  {
    id: 'nyc',
    city: 'New York',
    state: 'NY',
    timeZone: 'America/New_York',
    hub: 'Hudson Yards',
    route: 'Bear Mountain & Route 9W',
    radius: '40 mi',
    note: 'Delivered to the curb in Manhattan. An hour later, the Hudson Valley is yours.',
    pickup: [-74.0017, 40.7536],
  },
  {
    id: 'scottsdale',
    city: 'Scottsdale',
    state: 'AZ',
    timeZone: 'America/Phoenix',
    hub: 'Old Town',
    route: 'Beeline Highway to Payson',
    radius: '55 mi',
    note: 'Saguaro silhouettes, empty switchbacks, and three hundred days of sun.',
    pickup: [-111.9261, 33.4942],
  },
]
