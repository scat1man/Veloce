import { images, type SiteImage } from './images'
import type { ModelId } from '../three/models'

export type Vehicle = {
  id: string
  manufacturer: string
  name: string
  tagline: string
  summary: string
  image: SiteImage
  gallery: { image: SiteImage; label: string }[]
  /** VELOCÉ home city for this car. */
  location: string
  /**
   * Manufacturer-published figures, verified against public sources.
   * `sprint` is quoted for the distance in `sprintLabel` — makers differ (0–60 mph vs 0–62 mph).
   */
  specs: {
    engine: string
    displacement: string
    power: string
    sprint: string
    sprintLabel: '0–60 mph' | '0–62 mph'
    topSpeed: string
  }
  drivetrain: string
  /** Real-time 3D model slot (see three/models.ts). */
  model3d: ModelId
  /** Anchor of the car's scroll chapter in the 3D act, if it has one. */
  chapter?: string
}

export const vehicles: Vehicle[] = [
  {
    id: 'gt3-rs',
    manufacturer: 'Porsche',
    name: '911 GT3 RS',
    tagline: 'Aerodynamics from the race car, licensed for the road.',
    summary:
      'A naturally aspirated flat-six that sings to 9,000 rpm, wrapped in an aero package borrowed from the paddock. Road-legal, barely domesticated.',
    image: images.gt3Rear,
    gallery: [
      { image: images.gt3Rear, label: 'Dusk' },
      { image: images.gt3Sunset, label: 'Silhouette' },
      { image: images.gt3Rolling, label: 'Highway' },
    ],
    specs: { engine: '4.0L Flat-6', displacement: '3,996 cc', power: '518 hp', sprint: '3.0 s', sprintLabel: '0–60 mph', topSpeed: '184 mph' },
    location: 'Los Angeles, CA',
    drivetrain: 'RWD · 7-speed PDK',
    model3d: 'gt3-rs',
    chapter: 'car-gt3-rs',
  },
  {
    id: 'sf90',
    manufacturer: 'Ferrari',
    name: 'SF90 Stradale',
    tagline: 'Three electric motors. One twin-turbo V8.',
    summary:
      'Nearly a thousand horsepower from a hybrid drivetrain that will also run silently on electric power alone.',
    image: images.sf90Studio,
    gallery: [
      { image: images.sf90Studio, label: 'Studio' },
      { image: images.sf90Road, label: 'Coast' },
      { image: images.sf90Front, label: 'Avenue' },
    ],
    specs: { engine: '4.0L V8 Hybrid', displacement: '3,990 cc', power: '986 hp', sprint: '2.5 s', sprintLabel: '0–62 mph', topSpeed: '211 mph' },
    location: 'Miami, FL',
    drivetrain: 'AWD · 8-speed DCT',
    model3d: 'sf90',
    chapter: 'car-sf90',
  },
  {
    id: 'revuelto',
    model3d: 'revuelto',
    manufacturer: 'Lamborghini',
    name: 'Revuelto',
    tagline: 'A V12, electrified.',
    summary:
      'A naturally aspirated V12 joined by three electric motors. Over a thousand horsepower, and scissor doors.',
    image: images.revueltoDark,
    gallery: [
      { image: images.revueltoDark, label: 'Showroom' },
      { image: images.revueltoRear, label: 'Detail' },
    ],
    specs: { engine: '6.5L V12 Hybrid', displacement: '6,498 cc', power: '1,001 hp', sprint: '2.5 s', sprintLabel: '0–62 mph', topSpeed: '217 mph' },
    location: 'Las Vegas, NV',
    drivetrain: 'AWD · 8-speed DCT',
  },
  {
    id: '750s',
    model3d: '750s',
    manufacturer: 'McLaren',
    name: '750S',
    tagline: 'Carbon tub. Hydraulic steering. Nothing in between.',
    summary:
      'A carbon tub, a twin-turbo V8 and hydraulic steering that tells you everything the front tyres feel.',
    image: images.mclarenRoad,
    gallery: [{ image: images.mclarenRoad, label: 'Road' }],
    specs: { engine: '4.0L Twin-Turbo V8', displacement: '3,994 cc', power: '740 hp', sprint: '2.7 s', sprintLabel: '0–60 mph', topSpeed: '206 mph' },
    location: 'New York, NY',
    drivetrain: 'RWD · 7-speed SSG',
  },
  {
    id: 'db12',
    model3d: 'db12',
    manufacturer: 'Aston Martin',
    name: 'DB12 Volante',
    tagline: 'The open-top grand tourer.',
    summary:
      'Six hundred and seventy horsepower and a fabric roof that folds away in fourteen seconds.',
    image: images.db12Street,
    gallery: [{ image: images.db12Street, label: 'Street' }],
    specs: { engine: '4.0L Twin-Turbo V8', displacement: '3,982 cc', power: '671 hp', sprint: '3.6 s', sprintLabel: '0–60 mph', topSpeed: '202 mph' },
    location: 'Scottsdale, AZ',
    drivetrain: 'RWD · 8-speed Auto',
  },
  {
    id: 'amg-gt',
    model3d: 'amg-gt',
    manufacturer: 'Mercedes-AMG',
    name: 'GT 63',
    tagline: 'One engine, built by one engineer. Room for four.',
    summary:
      'A twin-turbo V8 assembled by one engineer in Affalterbach, in a four-door coupé with all-wheel drive.',
    image: images.amgProfile,
    gallery: [{ image: images.amgProfile, label: 'Profile' }],
    specs: { engine: '4.0L Twin-Turbo V8', displacement: '3,982 cc', power: '577 hp', sprint: '3.3 s', sprintLabel: '0–60 mph', topSpeed: '193 mph' },
    location: 'Los Angeles, CA',
    drivetrain: 'AWD · 9-speed MCT',
  },
]

export const vehicleLabel = (v: Vehicle) => `${v.manufacturer} ${v.name}`
export const vehicleById = (id: string) => vehicles.find((v) => v.id === id)
