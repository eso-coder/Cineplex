// ============================================================
//  FARS - Colored console logger
// ============================================================
import chalk from 'chalk';

export function banner(): void {
  console.log('');
  console.log(chalk.bold.white(' ====================================================='));
  console.log(chalk.bold.white('   FARS  -  Fully Automatic Running System  v1.0'));
  console.log(chalk.bold.white('   CinePlex UZ  |  Auto Movie Importer'));
  console.log(chalk.bold.white(' ====================================================='));
  console.log('');
}

export function step(n: string, msg: string): void {
  console.log('');
  console.log(chalk.magenta(` [${n}]  ${msg}`));
}

export function log(msg: string): void {
  console.log(chalk.cyan(`   ${msg}`));
}

export function ok(msg: string): void {
  console.log(chalk.green(`   OK  ${msg}`));
}

export function warn(msg: string): void {
  console.log(chalk.yellow(`   !!  ${msg}`));
}

export function error(msg: string): void {
  console.log(chalk.red(`   XX  ${msg}`));
}

export function info(label: string, value: string): void {
  console.log(`   ${chalk.gray(label.padEnd(12))} ${chalk.white(value)}`);
}

export function done(videoUrl: string, adminUrl: string): void {
  console.log('');
  console.log(chalk.green(' ====================================================='));
  console.log(chalk.green('   TAYYOR!  Film muvaffaqiyatli qoshildi.'));
  console.log(chalk.green(' ====================================================='));
  console.log('');
  console.log(`   ${chalk.gray('Video URL')} ${chalk.cyan(videoUrl)}`);
  console.log(`   ${chalk.gray('Admin    ')} ${chalk.cyan(adminUrl)}`);
  console.log('');
}

export function summary(data: {
  title: string;
  year: number;
  rating: number;
  genres: string[];
  cast: string[];
  duration: number;
  trailerId?: string;
  hasBanner: boolean;
  galleryCount: number;
  videoUrl: string;
}): void {
  console.log('');
  console.log(chalk.bold('  Yig\'ilgan ma\'lumotlar:'));
  info('Sarlavha', `${data.title} (${data.year})`);
  info('Reyting', `${data.rating}/10`);
  info('Janrlar', data.genres.join(', ') || '(topilmadi)');
  info('Aktyorlar', data.cast.slice(0, 3).join(', ') + (data.cast.length > 3 ? '...' : '') || '(topilmadi)');
  info('Davomiylik', data.duration > 0 ? `${data.duration} daqiqa` : '(topilmadi)');
  info('Trailer', data.trailerId || '(topilmadi)');
  info('Banner', data.hasBanner ? 'ha' : 'yoq');
  info('Gallery', `${data.galleryCount} ta rasm`);
  info('Video URL', data.videoUrl);
  console.log('');
}
