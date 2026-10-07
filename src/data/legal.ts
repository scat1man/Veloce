import { brand } from './content'

export type LegalDoc = { title: string; updated: string; intro: string; sections: { heading: string; body: string }[] }

/**
 * Plain-language notes for the demo. If this site is adapted for a real business,
 * replace them with text reviewed for that business and jurisdiction.
 */
export const privacy: LegalDoc = {
  title: 'Privacy',
  updated: 'October 2026',
  intro: `${brand.name} is a fictional brand and this site is a demonstration. It still treats the little you send it with care.`,
  sections: [
    {
      heading: 'What we collect',
      body: 'Only what you type into the request form: your name, email, the car, city and dates. Nothing is collected while you simply browse.',
    },
    {
      heading: 'Why',
      body: 'To answer your request and to let you check its status with your reference and email. Your details are never sold, shared for advertising or used for anything else.',
    },
    {
      heading: 'Cookies and tracking',
      body: 'There are no advertising or analytics cookies. The browser remembers only whether you have already seen the opening animation, so it is not replayed on every visit.',
    },
    {
      heading: 'Third parties',
      body: 'Fonts are served by Google Fonts, which receives your IP address as part of delivering them. Photography and 3D models are hosted with the site.',
    },
    {
      heading: 'Your choices',
      body: `Write to ${brand.email} to see, correct or delete a request you made. Test requests may be cleared at any time.`,
    },
  ],
}

export const terms: LegalDoc = {
  title: 'Terms',
  updated: 'October 2026',
  intro: `${brand.name} is a fictional demonstration brand. No vehicles are rented and no payment is ever taken through this site.`,
  sections: [
    {
      heading: 'Requests',
      body: 'A request is not a booking or a contract. In a live service, a concierge would confirm availability, price and conditions with you before anything is agreed.',
    },
    {
      heading: 'Content',
      body: 'Specifications, prices and availability are illustrative. Vehicle manufacturers, models and marks are trademarks of their respective owners and are shown for demonstration only; no affiliation is implied.',
    },
    {
      heading: 'Imagery',
      body: 'Photography is used under the Unsplash License and 3D models under the licences listed in Credits at the foot of the page.',
    },
    {
      heading: 'Fair use of the site',
      body: 'Please do not submit false requests in volume or attempt to disrupt the service. Automated submissions are filtered and rate limited.',
    },
  ],
}
