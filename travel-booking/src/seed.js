// Seeds destinations + packages (with itineraries) into the JSON DB if empty.
const { getDb, save } = require('./db');

function img(seed, w = 1200, h = 800) {
  // Reliable placeholder image service, deterministic by seed.
  return `https://picsum.photos/seed/${encodeURIComponent(seed)}/${w}/${h}`;
}

const DESTINATIONS = [
  {
    id: 'bali',
    name: 'Bali',
    country: 'Indonesia',
    tagline: 'Island of the Gods',
    description:
      'Tropical beaches, lush rice terraces, sacred temples and a vibrant wellness culture make Bali a dream escape for relaxation and adventure alike.',
    image: img('bali-cover'),
  },
  {
    id: 'paris',
    name: 'Paris',
    country: 'France',
    tagline: 'The City of Light',
    description:
      'World-class art, iconic landmarks, charming cafés and unforgettable cuisine. Paris blends romance and history at every corner.',
    image: img('paris-cover'),
  },
  {
    id: 'tokyo',
    name: 'Tokyo',
    country: 'Japan',
    tagline: 'Where tradition meets the future',
    description:
      'Neon-lit streets, ancient shrines, sushi counters and bullet trains. Tokyo is a thrilling fusion of the old and the ultramodern.',
    image: img('tokyo-cover'),
  },
  {
    id: 'santorini',
    name: 'Santorini',
    country: 'Greece',
    tagline: 'Whitewashed cliffs & blue domes',
    description:
      'Sunsets over the caldera, volcanic beaches and cliffside villages. Santorini is the jewel of the Aegean Sea.',
    image: img('santorini-cover'),
  },
  {
    id: 'dubai',
    name: 'Dubai',
    country: 'UAE',
    tagline: 'Luxury in the desert',
    description:
      'Soaring skyscrapers, golden dunes, world-record attractions and lavish shopping. Dubai is the playground of the future.',
    image: img('dubai-cover'),
  },
  {
    id: 'queenstown',
    name: 'Queenstown',
    country: 'New Zealand',
    tagline: 'Adventure capital of the world',
    description:
      'Snow-capped peaks, crystal lakes and adrenaline-pumping activities. Queenstown is paradise for thrill-seekers and nature lovers.',
    image: img('queenstown-cover'),
  },
];

function pkg(id, destinationId, title, nights, price, summary, highlights, itinerary, seed) {
  return {
    id,
    destinationId,
    title,
    nights,
    days: nights + 1,
    price, // USD
    summary,
    highlights,
    itinerary, // [{ day, title, details }]
    image: img(seed),
  };
}

const PACKAGES = [
  // ---- Bali ----
  pkg(
    'bali-essential',
    'bali',
    'Bali Essentials Getaway',
    4,
    899,
    'A perfect first taste of Bali: beaches, temples and culture.',
    ['Airport transfers', '4★ resort stay', 'Daily breakfast', 'Uluwatu temple tour'],
    [
      { day: 1, title: 'Arrival & Seminyak Sunset', details: 'Arrive in Bali, private transfer to your Seminyak resort, evening at the beach club watching the sunset.' },
      { day: 2, title: 'Uluwatu & Kecak Dance', details: 'Visit the cliffside Uluwatu Temple and enjoy the traditional Kecak fire dance at dusk.' },
      { day: 3, title: 'Ubud Rice Terraces', details: 'Explore the Tegalalang rice terraces, the Sacred Monkey Forest, and Ubud art market.' },
      { day: 4, title: 'Free Day & Spa', details: 'Relax with a Balinese spa treatment or optional water sports at Nusa Dua.' },
      { day: 5, title: 'Departure', details: 'Breakfast and transfer to the airport for your departure.' },
    ],
    'bali-pkg1'
  ),
  pkg(
    'bali-luxury',
    'bali',
    'Bali Luxury Villa Retreat',
    6,
    1899,
    'Private pool villas, fine dining and curated experiences.',
    ['Private pool villa', 'Private driver', 'Floating breakfast', 'Mount Batur sunrise trek'],
    [
      { day: 1, title: 'VIP Arrival', details: 'VIP fast-track arrival, transfer to your private pool villa in Ubud.' },
      { day: 2, title: 'Mount Batur Sunrise Trek', details: 'Early morning volcano trek to watch sunrise above the clouds, followed by a hot spring soak.' },
      { day: 3, title: 'Culinary Journey', details: 'Balinese cooking class and a degustation dinner at a cliffside restaurant.' },
      { day: 4, title: 'Nusa Penida Island', details: 'Speedboat to Nusa Penida for Kelingking Beach and snorkeling with manta rays.' },
      { day: 5, title: 'Wellness Day', details: 'Yoga session, full-body spa ritual and a floating breakfast in your villa.' },
      { day: 6, title: 'Seminyak Beach Clubs', details: 'Day of leisure at Bali\u2019s finest beach clubs and boutique shopping.' },
      { day: 7, title: 'Departure', details: 'Leisurely breakfast and private transfer to the airport.' },
    ],
    'bali-pkg2'
  ),

  // ---- Paris ----
  pkg(
    'paris-romance',
    'paris',
    'Romantic Paris Escape',
    3,
    1099,
    'Iconic landmarks, a Seine cruise and gourmet dining.',
    ['Central boutique hotel', 'Seine dinner cruise', 'Skip-the-line Eiffel Tower', 'Louvre tickets'],
    [
      { day: 1, title: 'Bonjour Paris', details: 'Arrival and check-in near the Latin Quarter, evening stroll along the Seine.' },
      { day: 2, title: 'Eiffel Tower & Louvre', details: 'Skip-the-line Eiffel Tower summit access and an afternoon at the Louvre.' },
      { day: 3, title: 'Montmartre & Seine Cruise', details: 'Explore artistic Montmartre and Sacr\u00e9-C\u0153ur, then a romantic dinner cruise on the Seine.' },
      { day: 4, title: 'Au Revoir', details: 'Breakfast and transfer to the airport.' },
    ],
    'paris-pkg1'
  ),
  pkg(
    'paris-versailles',
    'paris',
    'Paris & Versailles Grand Tour',
    5,
    1699,
    'The full Parisian experience plus the palace of Versailles.',
    ['4★ hotel', 'Versailles day trip', 'Wine tasting', 'Museum pass'],
    [
      { day: 1, title: 'Arrival', details: 'Arrive in Paris and settle into your central hotel; welcome dinner in Le Marais.' },
      { day: 2, title: 'Classic Landmarks', details: 'Notre-Dame area, Arc de Triomphe and a walk down the Champs-\u00c9lys\u00e9es.' },
      { day: 3, title: 'Palace of Versailles', details: 'Guided day trip to the Palace of Versailles and its gardens.' },
      { day: 4, title: 'Art & Wine', details: 'Mus\u00e9e d\u2019Orsay in the morning, French wine and cheese tasting in the evening.' },
      { day: 5, title: 'Free Day', details: 'Shopping at Galeries Lafayette or an optional Disneyland Paris excursion.' },
      { day: 6, title: 'Departure', details: 'Breakfast and airport transfer.' },
    ],
    'paris-pkg2'
  ),

  // ---- Tokyo ----
  pkg(
    'tokyo-discovery',
    'tokyo',
    'Tokyo Discovery',
    5,
    1399,
    'Temples, tech districts, sushi and day trips from the capital.',
    ['Hotel in Shinjuku', 'JR rail pass', 'Mt. Fuji day trip', 'Sushi-making class'],
    [
      { day: 1, title: 'Arrival in Tokyo', details: 'Transfer to Shinjuku, evening views from the Metropolitan Government Building.' },
      { day: 2, title: 'Old Tokyo', details: 'Senso-ji Temple in Asakusa, Nakamise shopping street and a river cruise to Odaiba.' },
      { day: 3, title: 'Mt. Fuji & Hakone', details: 'Day trip to the Mt. Fuji 5th station and a Hakone ropeway and lake cruise.' },
      { day: 4, title: 'Modern Tokyo', details: 'Shibuya Crossing, Harajuku, and a hands-on sushi-making class.' },
      { day: 5, title: 'Free Day', details: 'Optional Tokyo DisneySea or teamLab digital art museum.' },
      { day: 6, title: 'Departure', details: 'Breakfast and transfer to Narita/Haneda.' },
    ],
    'tokyo-pkg1'
  ),

  // ---- Santorini ----
  pkg(
    'santorini-bliss',
    'santorini',
    'Santorini Sunset Bliss',
    4,
    1249,
    'Caldera-view stays, catamaran cruise and famous Oia sunsets.',
    ['Caldera-view suite', 'Catamaran cruise', 'Wine tour', 'Oia sunset experience'],
    [
      { day: 1, title: 'Welcome to the Cyclades', details: 'Arrival and check-in to a caldera-view suite in Imerovigli.' },
      { day: 2, title: 'Catamaran Cruise', details: 'Sailing trip to the volcano, hot springs and Red Beach with a BBQ on board.' },
      { day: 3, title: 'Villages & Wine', details: 'Explore Fira and Pyrgos, plus a tasting at a traditional Santorini winery.' },
      { day: 4, title: 'Oia Sunset', details: 'Free morning, then the world-famous sunset from Oia castle.' },
      { day: 5, title: 'Departure', details: 'Breakfast and transfer to the airport/port.' },
    ],
    'santorini-pkg1'
  ),

  // ---- Dubai ----
  pkg(
    'dubai-deluxe',
    'dubai',
    'Dubai Deluxe Experience',
    4,
    1149,
    'Skyscrapers, desert safari and a day of waterpark fun.',
    ['5★ downtown hotel', 'Burj Khalifa tickets', 'Desert safari with dinner', 'Marina dhow cruise'],
    [
      { day: 1, title: 'Arrival', details: 'Transfer to your downtown hotel near the Dubai Mall and fountain show.' },
      { day: 2, title: 'At The Top', details: 'Burj Khalifa observation deck, Dubai Mall aquarium and souk visit.' },
      { day: 3, title: 'Desert Safari', details: 'Dune bashing, camel ride, and a BBQ dinner with live entertainment under the stars.' },
      { day: 4, title: 'Marina & Beaches', details: 'Relax at Jumeirah Beach and an evening dhow cruise dinner at the Marina.' },
      { day: 5, title: 'Departure', details: 'Breakfast and airport transfer.' },
    ],
    'dubai-pkg1'
  ),

  // ---- Queenstown ----
  pkg(
    'queenstown-adventure',
    'queenstown',
    'Queenstown Adventure Pack',
    5,
    1549,
    'Bungy, jet boats, Milford Sound and alpine scenery.',
    ['Lakeside hotel', 'Milford Sound cruise', 'Shotover jet boat', 'Skyline gondola'],
    [
      { day: 1, title: 'Arrival', details: 'Arrive in Queenstown, lakeside check-in and Skyline gondola at sunset.' },
      { day: 2, title: 'Adrenaline Day', details: 'Kawarau bungy jump (optional) and the thrilling Shotover jet boat ride.' },
      { day: 3, title: 'Milford Sound', details: 'Scenic drive through Fiordland to a cruise on majestic Milford Sound.' },
      { day: 4, title: 'Wine & Wanaka', details: 'Gibbston Valley wineries and a day trip to picturesque Lake Wanaka.' },
      { day: 5, title: 'Free Day', details: 'Optional skydive, hiking or a relaxed day by Lake Wakatipu.' },
      { day: 6, title: 'Departure', details: 'Breakfast and transfer to the airport.' },
    ],
    'queenstown-pkg1'
  ),
];

function seed() {
  const db = getDb();
  let changed = false;
  if (!db.destinations || db.destinations.length === 0) {
    db.destinations = DESTINATIONS;
    changed = true;
  }
  if (!db.packages || db.packages.length === 0) {
    db.packages = PACKAGES;
    changed = true;
  }
  if (changed) save();
  return { destinations: db.destinations.length, packages: db.packages.length };
}

module.exports = { seed };
