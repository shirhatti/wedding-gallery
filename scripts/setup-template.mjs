#!/usr/bin/env node

/**
 * Interactive setup script for gallery template
 * Helps configure wrangler.toml files and environment variables
 */

import { readFile, writeFile } from 'fs/promises';
import { createInterface } from 'readline';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

const rl = createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(prompt) {
  return new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
}

async function checkWranglerInstalled() {
  try {
    await execAsync('wrangler --version');
    return true;
  } catch (error) {
    return false;
  }
}

async function getAccountId() {
  try {
    const { stdout } = await execAsync('wrangler whoami');
    const match = stdout.match(/Account ID: ([a-f0-9]+)/);
    return match ? match[1] : null;
  } catch (error) {
    return null;
  }
}

async function updateWranglerConfig(filePath, config) {
  let content = await readFile(filePath, 'utf-8');

  // Update bucket name
  if (config.bucketName) {
    content = content.replace(/bucket_name = "YOUR_R2_BUCKET_NAME"/g, `bucket_name = "${config.bucketName}"`);
    content = content.replace(/preview_bucket_name = "YOUR_R2_BUCKET_NAME"/g, `preview_bucket_name = "${config.bucketName}"`);
  }

  // Update database
  if (config.databaseId && config.databaseName) {
    content = content.replace(/database_name = "YOUR_DATABASE_NAME"/g, `database_name = "${config.databaseName}"`);
    content = content.replace(/database_id = "YOUR_D1_DATABASE_ID"/g, `database_id = "${config.databaseId}"`);
  }

  // Update KV namespaces
  if (config.kvId && config.kvPreviewId) {
    content = content.replace(/id = "YOUR_KV_NAMESPACE_ID"/g, `id = "${config.kvId}"`);
    content = content.replace(/preview_id = "YOUR_KV_PREVIEW_NAMESPACE_ID"/g, `preview_id = "${config.kvPreviewId}"`);
  }

  await writeFile(filePath, content, 'utf-8');
}

async function createEnvFile(config) {
  const template = await readFile('.env.template', 'utf-8');
  let envContent = template;

  if (config.accountId) {
    envContent = envContent.replace('CLOUDFLARE_ACCOUNT_ID=YOUR_ACCOUNT_ID_HERE', `CLOUDFLARE_ACCOUNT_ID=${config.accountId}`);
  }

  if (config.bucketName) {
    envContent = envContent.replace('R2_BUCKET_NAME=YOUR_R2_BUCKET_NAME', `R2_BUCKET_NAME=${config.bucketName}`);
  }

  if (config.databaseId) {
    envContent = envContent.replace('D1_DATABASE_ID=YOUR_D1_DATABASE_ID', `D1_DATABASE_ID=${config.databaseId}`);
  }

  if (config.databaseName) {
    envContent = envContent.replace('D1_DATABASE_NAME=YOUR_DATABASE_NAME', `D1_DATABASE_NAME=${config.databaseName}`);
  }

  if (config.kvId) {
    envContent = envContent.replace('KV_NAMESPACE_ID=YOUR_KV_NAMESPACE_ID', `KV_NAMESPACE_ID=${config.kvId}`);
  }

  if (config.kvPreviewId) {
    envContent = envContent.replace('KV_PREVIEW_NAMESPACE_ID=YOUR_KV_PREVIEW_NAMESPACE_ID', `KV_PREVIEW_NAMESPACE_ID=${config.kvPreviewId}`);
  }

  if (config.pagesProjectName) {
    envContent = envContent.replace('CLOUDFLARE_PAGES_PROJECT_NAME=YOUR_PAGES_PROJECT_NAME', `CLOUDFLARE_PAGES_PROJECT_NAME=${config.pagesProjectName}`);
  }

  await writeFile('.env', envContent, 'utf-8');
}

async function main() {
  console.log('🎨 Gallery Template Setup\n');
  console.log('This script will help you configure your gallery.\n');

  // Check for wrangler
  const hasWrangler = await checkWranglerInstalled();
  if (!hasWrangler) {
    console.log('❌ Wrangler CLI not found. Please install it first:');
    console.log('   npm install -g wrangler\n');
    process.exit(1);
  }

  console.log('✅ Wrangler CLI found\n');

  // Get account ID
  let accountId = await getAccountId();
  if (accountId) {
    console.log(`📋 Detected Cloudflare Account ID: ${accountId}`);
    const useDetected = await question('Use this account? (Y/n): ');
    if (useDetected.toLowerCase() === 'n') {
      accountId = await question('Enter your Cloudflare Account ID: ');
    }
  } else {
    console.log('⚠️  Could not detect account ID. Please run "wrangler login" first.');
    accountId = await question('Enter your Cloudflare Account ID (or press Enter to skip): ');
  }

  console.log('\n📦 Cloudflare Resources\n');
  console.log('You need to create these resources first. Run these commands:\n');
  console.log('  D1 Database:');
  console.log('    wrangler d1 create gallery-metadata\n');
  console.log('  KV Namespace:');
  console.log('    wrangler kv namespace create CACHE_VERSION');
  console.log('    wrangler kv namespace create CACHE_VERSION --preview\n');
  console.log('  R2 Bucket:');
  console.log('    wrangler r2 bucket create gallery-photos\n');

  const hasCreated = await question('Have you created these resources? (y/N): ');

  if (hasCreated.toLowerCase() !== 'y') {
    console.log('\n⏸️  Please create the resources first and run this script again.');
    console.log('   See SETUP.md for detailed instructions.\n');
    rl.close();
    return;
  }

  console.log('\n⚙️  Configuration\n');

  const config = {
    accountId: accountId || null,
    bucketName: await question('R2 Bucket Name (default: gallery-photos): ') || 'gallery-photos',
    databaseName: await question('D1 Database Name (default: gallery-metadata): ') || 'gallery-metadata',
    databaseId: await question('D1 Database ID (from wrangler d1 list): '),
    kvId: await question('KV Namespace ID (production): '),
    kvPreviewId: await question('KV Namespace ID (preview): '),
    pagesProjectName: await question('Cloudflare Pages Project Name: ')
  };

  console.log('\n🔧 Updating configuration files...\n');

  // Update wrangler.toml files
  try {
    await updateWranglerConfig('workers/viewer/wrangler.toml', config);
    console.log('✅ Updated workers/viewer/wrangler.toml');

    await updateWranglerConfig('workers/video-streaming/wrangler.toml', config);
    console.log('✅ Updated workers/video-streaming/wrangler.toml');

    await updateWranglerConfig('workers/album/wrangler.toml', config);
    console.log('✅ Updated workers/album/wrangler.toml');

    // Create .env file
    await createEnvFile(config);
    console.log('✅ Created .env file');

    console.log('\n✨ Configuration complete!\n');
    console.log('Next steps:');
    console.log('1. Review and edit .env file');
    console.log('2. Set up database schema: wrangler d1 execute ' + config.databaseName + ' --file=workers/viewer/schema.sql');
    console.log('3. Configure GitHub Actions secrets (see SETUP.md)');
    console.log('4. Deploy: See SETUP.md for deployment instructions\n');

  } catch (error) {
    console.error('❌ Error updating files:', error.message);
    console.log('\nPlease update the configuration files manually.');
  }

  rl.close();
}

main().catch(error => {
  console.error('Error:', error);
  process.exit(1);
});
