require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');
const Movie = require('../src/models/Movie');

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('MongoDB ga ulandi');

  // type: 'series' bo'lgan lekin seasons=0 va episodes=0 bo'lgan — bular movie
  const result = await Movie.updateMany(
    { type: 'series', seasons: { $in: [0, null] }, episodes: { $in: [0, null] } },
    { $set: { type: 'movie' } }
  );

  console.log(`Tuzatildi: ${result.modifiedCount} ta kino type=movie ga o'zgartirildi`);

  // Natijani ko'rish
  const series = await Movie.find({ type: 'series' }).select('title seasons episodes').lean();
  console.log('\nHozir type=series bo\'lganlar:');
  series.forEach(m => console.log(` - ${m.title} (${m.seasons} mavsum, ${m.episodes} qism)`));

  const movies = await Movie.find({ type: 'movie' }).select('title').lean();
  console.log(`\nJami type=movie: ${movies.length} ta`);

  await mongoose.disconnect();
})().catch(err => { console.error(err); process.exit(1); });
