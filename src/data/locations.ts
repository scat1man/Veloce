export type Location = {
  id: string
  city: string
  state: string
  timeZone: string
  hub: string
  route: string
  radius: string
  note: string
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
  },
]
