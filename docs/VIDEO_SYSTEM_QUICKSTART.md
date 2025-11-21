# Video Content Storage & Query System - Quick Start

This guide will help you get started with the wedding video content storage and query system.

## What's Been Implemented

✅ **Core Infrastructure**
- Prisma schema extensions for video segments, people, and moments
- TypeScript types for manifests and indexes
- Bloom filter implementation for fast existence checks
- Count-min sketch for frequency counting
- Index builder utilities
- Manifest generation utilities

✅ **Query API**
- Person search across all videographers
- Moment search with multi-angle support
- List people and moments
- Integrated into video-streaming worker

✅ **Documentation**
- Architecture overview
- API reference
- Type definitions

## Architecture Overview

```
Wedding Videos
    ↓
Segmentation (60s chunks)
    ↓
ML Processing (future: face detection, object recognition)
    ↓
Index Generation (bloom filters, time indexes, content indexes)
    ↓
Upload to R2
    ↓
Query via API (fast, content-based searches)
```

## Quick Start: Manual Setup

### Step 1: Update Database Schema

The Prisma schema has been extended with new models:
- `Videographer` - Camera operators/sources
- `VideoSegment` - 60-second video chunks
- `WeddingMoment` - Key events (ceremony, first dance, etc.)
- `Person` - People in the wedding
- `PersonAppearance` - Where people appear in segments
- `VideoIndex` - Metadata about indexes stored in R2

**Generate the Prisma client:**

```bash
npm run prisma:generate
```

**Create a migration (when ready):**

```bash
npx prisma migrate dev --name add_video_content_system
```

### Step 2: Create Sample Data

Here's an example of creating a wedding with videographers and moments:

```typescript
import { PrismaClient } from '@prisma/client';
import {
  createWeddingManifest,
  createVideographerManifest,
  serializeManifest
} from '@wedding-gallery/shared-video-lib';

const prisma = new PrismaClient();

// 1. Create videographer
await prisma.videographer.create({
  data: {
    id: 'videographer_main',
    name: 'Main Camera',
    operator: 'Professional Videographer',
    role: 'primary',
    weddingId: 'smith-jones-2025',
    createdAt: new Date(),
    updatedAt: new Date()
  }
});

// 2. Create a wedding moment
await prisma.weddingMoment.create({
  data: {
    id: 'first_dance',
    name: 'First Dance',
    momentType: 'reception_event',
    startTime: new Date('2025-06-15T19:30:00Z'),
    endTime: new Date('2025-06-15T19:34:30Z'),
    duration: 270,
    tags: JSON.stringify(['dance', 'romantic', 'reception_highlight']),
    featured: true,
    createdAt: new Date(),
    updatedAt: new Date()
  }
});

// 3. Create people
await prisma.person.createMany({
  data: [
    {
      id: 'person_bride',
      name: 'Sarah',
      role: 'bride',
      createdAt: new Date(),
      updatedAt: new Date()
    },
    {
      id: 'person_groom',
      name: 'Michael',
      role: 'groom',
      createdAt: new Date(),
      updatedAt: new Date()
    }
  ]
});

// 4. Generate wedding manifest
const weddingManifest = createWeddingManifest({
  wedding_id: 'smith-jones-2025',
  wedding_name: "Sarah & Michael's Wedding",
  wedding_date: '2025-06-15',
  location: 'Napa Valley, CA',
  videographers: [
    {
      id: 'videographer_main',
      name: 'Main Camera',
      operator: 'Professional Videographer',
      role: 'primary'
    }
  ],
  key_people: [
    { id: 'person_bride', name: 'Sarah', role: 'bride' },
    { id: 'person_groom', name: 'Michael', role: 'groom' }
  ]
});

// 5. Upload manifest to R2 (example using R2 binding)
await env.R2_BUCKET.put(
  'smith-jones-2025/manifest.json',
  serializeManifest(weddingManifest),
  {
    httpMetadata: {
      contentType: 'application/json'
    }
  }
);
```

### Step 3: Build Indexes

Example of building a person index:

```typescript
import {
  buildPersonIndex,
  buildPeopleBloomFilter,
  serializeManifest
} from '@wedding-gallery/shared-video-lib';

// Get person appearances from database
const appearances = await prisma.personAppearance.findMany({
  where: {
    segment: {
      videographerId: 'videographer_main'
    }
  },
  include: {
    segment: true,
    person: true
  }
});

// Build person index
const personIndex = buildPersonIndex(
  'videographer_main',
  appearances.map(app => ({
    person_id: app.personId,
    segment_id: app.segmentId,
    start_time: app.segment.startTime.toISOString(),
    end_time: app.segment.endTime.toISOString(),
    start_offset: app.startOffset,
    end_offset: app.endOffset,
    frame_count: app.frameCount,
    confidence_avg: app.confidence,
    confidence_min: app.confidence,
    thumbnail_uri: app.thumbnailUri || undefined
  })),
  'smith-jones-2025'
);

// Build bloom filter
const bloomFilter = buildPeopleBloomFilter(personIndex);

// Upload to R2
await env.R2_BUCKET.put(
  'smith-jones-2025/videographers/videographer_main/indices/content/people/index.json.gz',
  serializeManifest(personIndex),
  { httpMetadata: { contentType: 'application/json' } }
);

await env.R2_BUCKET.put(
  'smith-jones-2025/videographers/videographer_main/indices/content/bloom/people.bloom',
  bloomFilter.toBytes(),
  { httpMetadata: { contentType: 'application/octet-stream' } }
);
```

### Step 4: Query the API

Now you can query for people and moments:

```bash
# Find all clips of the bride
curl "https://your-worker.workers.dev/api/video/search/person?person_id=person_bride&wedding_id=smith-jones-2025"

# Get the first dance from all angles
curl "https://your-worker.workers.dev/api/video/search/moment?moment_id=first_dance&wedding_id=smith-jones-2025"

# List all people
curl "https://your-worker.workers.dev/api/video/people?wedding_id=smith-jones-2025"

# List all ceremony moments
curl "https://your-worker.workers.dev/api/video/moments?wedding_id=smith-jones-2025&type=ceremony"
```

## Project Structure

```
wedding-gallery/
├── docs/
│   ├── VIDEO_ARCHITECTURE.md        # System design
│   ├── VIDEO_QUERY_API.md           # API reference
│   └── VIDEO_SYSTEM_QUICKSTART.md   # This file
│
├── packages/shared-video-lib/src/
│   ├── types/
│   │   └── manifests.ts             # TypeScript types
│   ├── bloom-filter.ts              # Bloom filter implementation
│   ├── count-min-sketch.ts          # Count-min sketch implementation
│   ├── manifest-builder.ts          # Manifest generation
│   └── index-builder.ts             # Index building utilities
│
├── workers/video-streaming/src/
│   ├── handlers/
│   │   ├── person-search.ts         # Person search handler
│   │   └── moment-search.ts         # Moment search handler
│   └── index.ts                     # Main worker (with new routes)
│
└── prisma/
    └── schema.prisma                # Extended with video models
```

## What's Next?

### Phase 1: Basic Integration (Current)
- ✅ Infrastructure and types
- ✅ Query API
- ⏭️ Database migration
- ⏭️ Sample data creation

### Phase 2: Video Processing Pipeline
- ⏭️ Segment video uploads into 60s chunks
- ⏭️ Generate thumbnails for segments
- ⏭️ Build time-based indexes
- ⏭️ Manual tagging of people and moments

### Phase 3: UI Integration
- ⏭️ Person search component
- ⏭️ Multi-angle moment viewer
- ⏭️ Timeline navigator
- ⏭️ Tagging interface

### Phase 4: ML Integration (Future)
- ⏭️ Face detection and recognition
- ⏭️ Object detection (bouquet, rings, cake)
- ⏭️ Audio transcription for speeches
- ⏭️ Automatic moment detection

## Example Use Cases

### 1. Find All Clips of the Bride

```typescript
const result = await fetch(
  '/api/video/search/person?person_id=person_bride&wedding_id=smith-jones-2025'
).then(r => r.json());

console.log(`Found ${result.total_clips} clips (${Math.round(result.total_duration_seconds / 60)} minutes)`);

// Display clips in UI
result.results.forEach(vg => {
  vg.appearances.forEach(clip => {
    renderVideoClip(clip.hls_url, clip.thumbnail);
  });
});
```

### 2. Multi-Angle Moment Viewer

```typescript
const moment = await fetch(
  '/api/video/search/moment?moment_id=first_dance&wedding_id=smith-jones-2025'
).then(r => r.json());

// Set up synchronized multi-angle player
const players = moment.angles.map(angle =>
  createVideoPlayer({
    title: angle.videographer_name,
    angle: angle.angle,
    hlsUrl: angle.segments[0].hls_url
  })
);

// Sync playback
players.forEach(player => {
  player.on('play', () => players.forEach(p => p.play()));
  player.on('pause', () => players.forEach(p => p.pause()));
});
```

### 3. Timeline Navigation

```typescript
// Show all footage from ceremony time (3pm-4pm)
const segments = await fetch(
  '/api/video/timeline?start=2025-06-15T15:00:00Z&end=2025-06-15T16:00:00Z&wedding_id=smith-jones-2025'
).then(r => r.json());

// Render timeline with segments
renderTimeline(segments);
```

## Performance Tips

1. **Bloom Filters**: Always check bloom filters before fetching full indexes
2. **Parallel Queries**: Query multiple videographers in parallel
3. **Caching**: Leverage Cloudflare's edge cache (5-minute TTL)
4. **Lazy Loading**: Only fetch thumbnails/videos when user scrolls
5. **Progressive Enhancement**: Show results as they arrive (don't wait for all)

## Troubleshooting

### "Wedding manifest not found"
Ensure you've created and uploaded the wedding manifest to R2:
```typescript
await env.R2_BUCKET.put('smith-jones-2025/manifest.json', manifestJSON);
```

### "Person not found"
Check that:
1. The person exists in the wedding manifest's `key_people` array
2. Person index has been built and uploaded
3. Bloom filter has been generated and uploaded

### Slow queries
- Check bloom filter size (should be ~100KB)
- Ensure indexes are gzipped
- Verify edge caching is working (check X-Cache header)

## API Examples

See [VIDEO_QUERY_API.md](./VIDEO_QUERY_API.md) for complete API documentation and examples.

## Contributing

When adding new features:
1. Update TypeScript types in `manifests.ts`
2. Add builder utilities in `index-builder.ts`
3. Create handler in `workers/video-streaming/src/handlers/`
4. Add route in `workers/video-streaming/src/index.ts`
5. Update documentation

## Support

For questions or issues:
- Check the [Architecture doc](./VIDEO_ARCHITECTURE.md) for design details
- Review [API reference](./VIDEO_QUERY_API.md) for endpoint specs
- Inspect browser network tab for API responses
- Check Cloudflare Workers logs for errors
