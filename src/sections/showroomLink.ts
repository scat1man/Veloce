import { scrollToHash } from '../hooks/scrollTo'

/** Lets other sections point at the Showroom: filter it to a city, and optionally open one car. */
export type ShowroomRequest = { city?: string; carId?: string }

export const SHOWROOM_EVENT = 'veloce:showroom'

export function showInShowroom(req: ShowroomRequest) {
  window.dispatchEvent(new CustomEvent<ShowroomRequest>(SHOWROOM_EVENT, { detail: req }))
  if (!req.carId) scrollToHash('#showroom', { offset: -80 })
}
