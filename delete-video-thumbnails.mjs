import { execSync } from 'child_process';

const keys = [
  'thumbnails/small/1759545666081-IMG_4309.MOV',
  'thumbnails/medium/1759545666081-IMG_4309.MOV',
  'thumbnails/large/1759545666081-IMG_4309.MOV',
  'thumbnails/small/1759546246638-IMG_5840.mov',
  'thumbnails/medium/1759546246638-IMG_5840.mov',
  'thumbnails/large/1759546246638-IMG_5840.mov',
  'thumbnails/small/1759546248612-IMG_5866.mov',
  'thumbnails/medium/1759546248612-IMG_5866.mov',
  'thumbnails/large/1759546248612-IMG_5866.mov'
];

for (const key of keys) {
  console.log(`Deleting ${key}...`);
  try {
    execSync(`npx wrangler r2 object delete "wedding-photos/${key}" --remote`, {
      stdio: 'inherit'
    });
  } catch (e) {
    console.error(`Failed to delete ${key}`);
  }
}

console.log('\nDone!');
