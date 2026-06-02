require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const Genre = require('../src/models/Genre');
const User = require('../src/models/User');
const Movie = require('../src/models/Movie');
const UserFilm = require('../src/models/UserFilm');
const Follow = require('../src/models/Follow');

// Stable poster art (TMDB CDN — no API key needed to display images).
const poster = (path) => `https://image.tmdb.org/t/p/w500${path}`;

const GENRES = [
  'Action', 'Adventure', 'Animation', 'Comedy', 'Crime',
  'Documentary', 'Drama', 'Fantasy', 'Horror', 'Mystery',
  'Romance', 'Sci-Fi', 'Thriller', 'Western', 'Biography',
];

const ADMIN = {
  name: 'Admin',
  email: 'admin@movie.com',
  password: 'Admin123!',
  role: 'admin',
};

const run = async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB');

  // ─── Genres ──────────────────────────────────────────────────────────────
  await Genre.deleteMany({});
  const genres = await Genre.insertMany(GENRES.map((name) => ({ name })));
  console.log(`Seeded ${genres.length} genres`);

  // ─── Admin user ──────────────────────────────────────────────────────────
  await User.deleteOne({ email: ADMIN.email });
  const admin = await User.create(ADMIN);
  console.log(`Admin created: ${admin.email} / password: ${ADMIN.password}`);

  // ─── Sample movies ───────────────────────────────────────────────────────
  await Movie.deleteMany({});

  const actionGenre = genres.find((g) => g.name === 'Action');
  const dramaGenre = genres.find((g) => g.name === 'Drama');
  const scifiGenre = genres.find((g) => g.name === 'Sci-Fi');

  const sampleMovies = [
    {
      title: 'Inception',
      description: 'A thief who steals corporate secrets through the use of dream-sharing technology.',
      poster: { url: 'https://via.placeholder.com/300x450?text=Inception' },
      trailerUrl: 'https://www.youtube.com/watch?v=YoHD9XEInc0',
      genres: [actionGenre._id, scifiGenre._id],
      director: 'Christopher Nolan',
      cast: ['Leonardo DiCaprio', 'Joseph Gordon-Levitt', 'Elliot Page'],
      releaseYear: 2010,
      duration: 148,
      country: 'USA',
      language: 'English',
      isFeatured: true,
      createdBy: admin._id,
    },
    {
      title: 'The Shawshank Redemption',
      description: 'Two imprisoned men bond over years, finding solace and eventual redemption through acts of common decency.',
      poster: { url: 'https://via.placeholder.com/300x450?text=Shawshank' },
      genres: [dramaGenre._id],
      director: 'Frank Darabont',
      cast: ['Tim Robbins', 'Morgan Freeman'],
      releaseYear: 1994,
      duration: 142,
      country: 'USA',
      language: 'English',
      isFeatured: true,
      createdBy: admin._id,
    },
    {
      title: 'Interstellar',
      description: 'A team of explorers travel through a wormhole in space in an attempt to ensure humanity\'s survival.',
      poster: { url: 'https://via.placeholder.com/300x450?text=Interstellar' },
      trailerUrl: 'https://www.youtube.com/watch?v=zSWdZVtXT7E',
      genres: [scifiGenre._id, dramaGenre._id],
      director: 'Christopher Nolan',
      cast: ['Matthew McConaughey', 'Anne Hathaway', 'Jessica Chastain'],
      releaseYear: 2014,
      duration: 169,
      country: 'USA',
      language: 'English',
      isFeatured: false,
      createdBy: admin._id,
    },
  ];

  const movies = await Movie.insertMany(sampleMovies);
  console.log(`Seeded ${movies.length} movies`);

  // ─── Demo profile (Letterboxd-style) ──────────────────────────────────────
  const romanceGenre = genres.find((g) => g.name === 'Romance');
  const animationGenre = genres.find((g) => g.name === 'Animation');

  await User.deleteOne({ email: 'lorie@cineplex.app' });
  const lorie = await User.create({
    firstName: 'Lorie',
    lastName: '',
    name: 'lorie',
    email: 'lorie@cineplex.app',
    password: 'Lorie123!',
    isVerified: true,
    isPatron: true,
    location: 'cottage',
    website: 'folklore.com',
    socialHandle: 'tsfolklore',
    avatar: { url: poster('/uHztJZqgFmgUmEgTjLh2hzGtSrk.jpg'), public_id: '' },
    coverImage: { url: 'https://images.unsplash.com/photo-1501785888041-af3ef285b470?w=1600&q=80', public_id: '' },
  });
  console.log(`Demo user created: ${lorie.email} / Lorie123!`);

  // Demo catalogue used for favourites + recent activity.
  const demoCatalogue = [
    { title: 'Pride & Prejudice', releaseYear: 2005, posterPath: '/sGjIvtVvTlWnia2zfJfHz81pZ9P.jpg', genres: [romanceGenre._id, dramaGenre._id] },
    { title: 'Carol', releaseYear: 2015, posterPath: '/wYff1Sp0H6CO4Hy8sNT9wY8mz0F.jpg', genres: [romanceGenre._id, dramaGenre._id] },
    { title: 'Brokeback Mountain', releaseYear: 2005, posterPath: '/zV5KQHTppZjANbBfQDINEAdF2hY.jpg', genres: [romanceGenre._id, dramaGenre._id] },
    { title: 'Marriage Story', releaseYear: 2019, posterPath: '/cP6yKMQQAR8B4DfgsKuY0WG6XbT.jpg', genres: [dramaGenre._id] },
    { title: 'Little Women', releaseYear: 2019, posterPath: '/yn5ihODyM2Dymrws2H1A56vy1q3.jpg', genres: [dramaGenre._id, romanceGenre._id] },
    { title: 'Emma', releaseYear: 2020, posterPath: '/tvht5Oaapn5sFt3k8Yzm07JOQDb.jpg', genres: [romanceGenre._id] },
    { title: 'Peter Pan', releaseYear: 2003, posterPath: '/2u3Pp9zEhFhEzVMTLkqqYWqRr1m.jpg', genres: [animationGenre._id] },
    { title: 'Princess Mononoke', releaseYear: 1997, posterPath: '/jHWmNr7m544fJ8eItsfNk8fs2Ed.jpg', genres: [animationGenre._id] },
  ];

  const demoMovies = await Movie.insertMany(
    demoCatalogue.map((m) => ({
      title: m.title,
      description: `${m.title} — a beloved entry in lorie's collection.`,
      poster: { url: poster(m.posterPath) },
      genres: m.genres,
      releaseYear: m.releaseYear,
      duration: 120,
      country: 'USA',
      language: 'English',
      createdBy: admin._id,
    }))
  );

  const byTitle = Object.fromEntries(demoMovies.map((m) => [m.title, m]));

  // Favourites (first 5 are the "Favourite Films" row; the rest expand via Show more)
  const favourites = ['Pride & Prejudice', 'Carol', 'Brokeback Mountain', 'Marriage Story', 'Little Women', 'Emma', 'Princess Mononoke'];
  // Recent activity (most recent first), with star ratings + likes
  const activity = [
    { title: 'Emma', rating: 4.5, liked: true, daysAgo: 1 },
    { title: 'Peter Pan', rating: 4, liked: false, daysAgo: 3 },
    { title: 'Princess Mononoke', rating: 5, liked: true, daysAgo: 5 },
    { title: 'Marriage Story', rating: 4, liked: false, daysAgo: 8 },
    { title: 'Carol', rating: 5, liked: true, daysAgo: 12 },
    { title: 'Little Women', rating: 4.5, liked: true, daysAgo: 20 },
  ];

  await UserFilm.deleteMany({ user: lorie._id });
  const docs = [];
  for (const a of activity) {
    docs.push({
      user: lorie._id,
      film: byTitle[a.title]._id,
      watched: true,
      rating: a.rating,
      liked: a.liked,
      isFavourite: favourites.includes(a.title),
      watchedAt: new Date(Date.now() - a.daysAgo * 86400000),
    });
  }
  // Favourites that weren't in the recent-activity list
  for (const t of favourites) {
    if (!activity.find((a) => a.title === t)) {
      docs.push({ user: lorie._id, film: byTitle[t]._id, watched: true, isFavourite: true, rating: 4, watchedAt: new Date(Date.now() - 60 * 86400000) });
    }
  }
  await UserFilm.create(docs);
  console.log(`Seeded ${docs.length} UserFilm rows for demo profile`);

  // Followers / following counts
  await Follow.deleteMany({ $or: [{ follower: lorie._id }, { following: lorie._id }] });
  const fans = await User.insertMany(
    Array.from({ length: 6 }).map((_, i) => ({
      name: `cinephile_${i + 1}`,
      email: `fan${i + 1}@cineplex.app`,
      password: 'Fan12345!',
      isVerified: true,
    }))
  );
  await Follow.create([
    ...fans.map((f) => ({ follower: f._id, following: lorie._id })), // followers
    ...fans.slice(0, 3).map((f) => ({ follower: lorie._id, following: f._id })), // following
  ]);
  console.log(`Seeded follows: ${fans.length} followers, 3 following`);

  console.log('\n✅ Seed completed successfully');
  console.log('─────────────────────────────────');
  console.log(`Admin email:    ${ADMIN.email}`);
  console.log(`Admin password: ${ADMIN.password}`);
  console.log(`Demo profile:   lorie@cineplex.app / Lorie123!`);
  console.log('─────────────────────────────────');

  process.exit(0);
};

run().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
