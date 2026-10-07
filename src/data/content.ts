import type { ImageKey } from './images'

export const brand = {
  name: 'VELOCÉ',
  email: 'concierge@veloce.example',
  phone: '+1 (310) 555-0148',
  disclaimer:
    'VELOCÉ is a fictional demonstration brand. Vehicle manufacturers and trademarks belong to their respective owners.',
}

export type NavLink = { label: string; href: string }

export const navLinks: NavLink[] = [
  { label: 'Marques', href: '#marques' },
  { label: 'Showroom', href: '#showroom' },
  { label: 'Service', href: '#experience' },
  { label: 'Locations', href: '#locations' },
  { label: 'About', href: '#about' },
]

export const footerLinks: NavLink[] = [...navLinks, { label: 'Contact', href: '#contact' }]

/** Social profiles. Only entries with a real URL are shown in the footer. */
export const socialLinks: { label: string; url: string }[] = [
  { label: 'Instagram', url: '' },
  { label: 'YouTube', url: '' },
  { label: 'LinkedIn', url: '' },
]

/** Guest services and legal notes: hash links open side sheets (components/SitePanels.tsx). */
export const guestLinks: NavLink[] = [
  { label: 'Manage a booking', href: '#manage' },
  { label: 'Privacy', href: '#privacy' },
  { label: 'Terms', href: '#terms' },
]

/** Optional designer credit in the footer, e.g. { label: 'Website by Studio Name', url: 'https://…' }. Hidden while label is empty. */
export const credit = { label: '', url: '' }

export type ExperienceStep = {
  title: string
  body: string
  detail: string
  imageKey: ImageKey
}

export const experienceSteps: ExperienceStep[] = [
  {
    title: 'Delivered.',
    body: 'Your car arrives where you are.',
    detail: 'Home, hotel or hangar. A specialist hands over the keys, walks you through the car and collects it when you are done.',
    imageKey: 'delivered',
  },
  {
    title: 'Prepared.',
    body: 'Inspected before every drive.',
    detail: 'Each car is detailed, fuelled and checked against the manufacturer’s specification before it leaves us.',
    imageKey: 'turboRear',
  },
  {
    title: 'Planned.',
    body: 'We plan the road.',
    detail: 'Tell us how you like to drive. We suggest the route, the time to leave and the place to stop for lunch.',
    imageKey: 'gt3Rolling',
  },
]
