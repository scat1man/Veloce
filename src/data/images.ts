/**
 * Centralised image registry.
 * Every photograph on the site is referenced from here — swap a file in
 * /public/images (or point `src` at a CDN) and the whole site updates.
 * Two widths are shipped per image; components pick via srcSet + sizes.
 */
export type SiteImage = {
  src: string
  srcSet: string
  alt: string
  /** CSS object-position — lets each crop be art-directed without touching components. */
  position?: string
  /** Optional crop for narrow (portrait) viewports. */
  positionMobile?: string
  credit: string
}

const img = (file: string, alt: string, credit: string, position?: string, positionMobile?: string): SiteImage => ({
  src: `/images/${file}-2000.webp`,
  srcSet: `/images/${file}-960.webp 960w, /images/${file}-2000.webp 2000w`,
  alt,
  credit,
  position,
  positionMobile,
})

export const images = {
  // Porsche 911 GT3 RS
  gt3Sunset: img('gt3rs-sunset', 'Porsche 911 GT3 RS silhouetted against an orange sunset, rear wing catching the light', 'Jack White', '46% 60%', '66% 50%'),
  gt3Rear: img('gt3rs-rear', 'Porsche 911 GT3 RS from the rear, parked above a coastal headland at dusk', 'Jack White', '62% 60%'),
  gt3Dusk: img('gt3rs-dusk', 'Black Porsche 911 GT3 RS parked on an open moorland road at dusk', 'Jack White', '58% 62%'),
  gt3Rolling: img('gt3rs-rolling', 'White Porsche 911 GT3 RS driving down an open highway', 'D Panyukov', '50% 55%'),
  gt3Profile: img('gt3rs-profile', 'White Porsche 911 GT3 RS in side profile on a mountain road', 'N O E L', '50% 58%'),

  // Ferrari SF90 Stradale
  sf90Studio: img('sf90-studio', 'Red Ferrari SF90 Stradale lit in a dark red studio', 'Adrian Newell', '50% 62%'),
  sf90Road: img('sf90-road', 'Red Ferrari SF90 Stradale on a coastal road beside dunes', 'Ninah Heikamp', '60% 60%'),
  sf90Front: img('sf90-front', 'Red Ferrari SF90 Stradale parked on a tree-lined street', 'Adrian Newell', '50% 60%'),

  // Lamborghini Revuelto
  revueltoDark: img('revuelto-rear-dark', 'Orange Lamborghini Revuelto from the rear in a dark showroom, its hexagonal tail lamps lit', 'Francesco Liotti', '50% 42%', '50% 40%'),
  revueltoRear: img('revuelto-rear', 'Rear detail of a Lamborghini Revuelto with its illuminated badge', 'Francesco Liotti', '50% 50%'),

  // McLaren 750S
  mclarenRoad: img('mclaren-road', 'Grey McLaren supercar on a tree-lined road at dusk', 'Ino Pascual', '58% 58%'),

  // Aston Martin DB12
  db12Street: img('db12-street', 'Dark grey Aston Martin DB12 parked on a city street', 'Roman', '50% 62%'),

  // Mercedes-AMG GT
  amgProfile: img('amggt-profile', 'Grey Mercedes-AMG GT in side profile against a pale wall', 'Aaron Huber', '50% 58%'),

  // Cities (location previews)
  cityLA: img('city-los-angeles', 'Los Angeles at night from Griffith Observatory, the downtown towers above a grid of lights', 'Denys Nevozhai', '50% 40%'),
  cityMiami: img('city-miami', 'Art deco hotels lit in pink and teal on a palm-lined street in Miami Beach at night', 'Ryan Spencer', '62% 50%'),
  cityVegas: img('city-las-vegas', 'Red sandstone of the Valley of Fire, Nevada, under a blue dusk sky', 'Zoshua Colah', '50% 55%'),
  cityNY: img('city-new-york', 'Long-exposure light trails along the East River beneath the lit Lower Manhattan skyline', 'Zac Ong', '55% 50%'),
  cityScottsdale: img('city-scottsdale', 'A saguaro cactus in warm evening light in the Sonoran Desert', 'Dan Begel', '50% 30%'),

  // Experience
  delivered: img('exp-delivered', 'Grey Porsche 911 waiting at the entrance of an elegant building', 'Aleksandr Zaitsev', '42% 60%'),
  turboRear: img('turbos-rear', 'Grey Porsche 911 Turbo S from the rear with its full-width light bar', 'redcharlie', '50% 55%'),
  road: img('exp-road', 'A lone car on a winding mountain road', 'Jack White', '50% 50%'),
} satisfies Record<string, SiteImage>

export type ImageKey = keyof typeof images
export const imageCredits = [...new Set(Object.values(images).map((i) => i.credit))]
