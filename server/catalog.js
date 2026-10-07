// What can be booked. The frontend's src/data/vehicles.ts and locations.ts hold the
// full content (images, specs, 3D models); the server only needs ids and names to
// validate requests. If you add a car or a city there, add its id here too.
export const vehicles = {
  'gt3-rs': 'Porsche 911 GT3 RS',
  sf90: 'Ferrari SF90 Stradale',
  revuelto: 'Lamborghini Revuelto',
  '750s': 'McLaren 750S',
  db12: 'Aston Martin DB12 Volante',
  'amg-gt': 'Mercedes-AMG GT 63',
}

export const cities = {
  la: 'Los Angeles, CA',
  mia: 'Miami, FL',
  las: 'Las Vegas, NV',
  nyc: 'New York, NY',
  scottsdale: 'Scottsdale, AZ',
}
