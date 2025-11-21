# Video Content Query API

This document describes the API endpoints for querying video content in the wedding gallery system.

## Overview

The Video Content Query API enables fast, content-based searches across wedding footage:
- Find all appearances of specific people
- Discover wedding moments from multiple camera angles
- Navigate timeline efficiently
- Access indexed metadata

## Authentication

All API endpoints require the same authentication as the main gallery:
- Cookie-based auth for web browsers
- `?token=xxx` query parameter for HLS players (iOS Safari)

## Endpoints

### 1. Person Search

Find all appearances of a person across all videographers.

**Endpoint:** `GET /api/video/search/person`

**Query Parameters:**
- `person_id` (required): Unique identifier for the person
- `wedding_id` (optional): Wedding event ID (default: 'default')

**Example Request:**
```bash
curl "https://your-worker.workers.dev/api/video/search/person?person_id=person_bride&wedding_id=smith-jones-2025"
```

**Example Response:**
```json
{
  "person_id": "person_bride",
  "results": [
    {
      "videographer_id": "videographer_main",
      "videographer_name": "Main Camera (Professional)",
      "appearances": [
        {
          "segment_id": "seg_ceremony_001",
          "timestamp": "2025-06-15T15:00:00Z",
          "duration": 150.5,
          "thumbnail": "videographers/videographer_main/segments/seg_ceremony_001/people/person_bride.jpg",
          "moment": "ceremony_entrance",
          "hls_url": "/api/hls/smith-jones-2025/videographers/videographer_main/segments/seg_ceremony_001/playlist.m3u8"
        }
      ]
    }
  ],
  "total_clips": 45,
  "total_duration_seconds": 4580,
  "search_time_ms": 128
}
```

**Performance:**
- Uses bloom filters for fast negative lookups
- Parallel queries across videographers
- Typically < 500ms response time

---

### 2. List People

Get list of all people in a wedding.

**Endpoint:** `GET /api/video/people`

**Query Parameters:**
- `wedding_id` (optional): Wedding event ID (default: 'default')

**Example Request:**
```bash
curl "https://your-worker.workers.dev/api/video/people?wedding_id=smith-jones-2025"
```

**Example Response:**
```json
{
  "wedding_id": "smith-jones-2025",
  "people": [
    {
      "id": "person_bride",
      "name": "Sarah",
      "role": "bride"
    },
    {
      "id": "person_groom",
      "name": "Michael",
      "role": "groom"
    },
    {
      "id": "person_moh",
      "name": "Jessica",
      "role": "maid_of_honor"
    }
  ]
}
```

---

### 3. Moment Search

Find a specific wedding moment with multi-angle views.

**Endpoint:** `GET /api/video/search/moment`

**Query Parameters:**
- `moment_id` (required): Unique identifier for the moment
- `wedding_id` (optional): Wedding event ID (default: 'default')

**Example Request:**
```bash
curl "https://your-worker.workers.dev/api/video/search/moment?moment_id=first_dance&wedding_id=smith-jones-2025"
```

**Example Response:**
```json
{
  "moment_id": "first_dance",
  "name": "First Dance",
  "start_time": "2025-06-15T19:30:00Z",
  "end_time": "2025-06-15T19:34:30Z",
  "angles": [
    {
      "videographer_id": "videographer_main",
      "videographer_name": "Main Camera",
      "angle": "front",
      "segments": [
        {
          "segment_id": "seg_reception_015",
          "start": "2025-06-15T19:30:00Z",
          "duration": 270,
          "hls_url": "/api/hls/smith-jones-2025/videographers/videographer_main/segments/seg_reception_015/playlist.m3u8",
          "thumbnail": "videographers/videographer_main/segments/seg_reception_015/thumbnail.jpg"
        }
      ]
    },
    {
      "videographer_id": "videographer_guest_1",
      "videographer_name": "Guest Camera 1",
      "angle": "side",
      "segments": [
        {
          "segment_id": "seg_guest1_042",
          "start": "2025-06-15T19:30:00Z",
          "duration": 270,
          "hls_url": "/api/hls/smith-jones-2025/videographers/videographer_guest_1/segments/seg_guest1_042/playlist.m3u8"
        }
      ]
    }
  ],
  "people_featured": ["person_bride", "person_groom"],
  "tags": ["dance", "romantic", "reception_highlight"]
}
```

**Use Cases:**
- Multi-angle video player
- Synchronized playback
- Switching between camera angles

---

### 4. List Moments

Get all moments in a wedding, optionally filtered by type.

**Endpoint:** `GET /api/video/moments`

**Query Parameters:**
- `wedding_id` (optional): Wedding event ID (default: 'default')
- `type` (optional): Filter by moment type ('ceremony', 'reception_event', 'preparation', 'portrait', 'candid')

**Example Request:**
```bash
curl "https://your-worker.workers.dev/api/video/moments?wedding_id=smith-jones-2025&type=ceremony"
```

**Example Response:**
```json
{
  "wedding_id": "smith-jones-2025",
  "moment_type": "ceremony",
  "moments": [
    {
      "moment_id": "ceremony_entrance",
      "name": "Bride's Entrance",
      "type": "ceremony",
      "start_time": "2025-06-15T15:00:00Z",
      "duration": 180,
      "videographers": ["videographer_main", "videographer_guest_1"]
    },
    {
      "moment_id": "ceremony_vows",
      "name": "Exchange of Vows",
      "type": "ceremony",
      "start_time": "2025-06-15T15:15:00Z",
      "duration": 300,
      "videographers": ["videographer_main"]
    }
  ]
}
```

---

## Storage Structure

The system uses a hierarchical storage structure in R2:

```
/{wedding_id}/
├── manifest.json                    # Wedding metadata
├── videographers/
│   └── {videographer_id}/
│       ├── manifest.json
│       ├── indices/
│       │   ├── content/
│       │   │   ├── bloom/people.bloom
│       │   │   ├── people/index.json.gz
│       │   │   └── moments/index.json.gz
│       │   └── time/timeline.json.gz
│       └── segments/{segment_id}/
│           ├── manifest.json
│           ├── video.m4s
│           └── thumbnail.jpg
└── global/
    ├── bloom/people-global.bloom
    ├── people/{person_id}.json
    └── moments/{moment_id}.json
```

## Index Types

### 1. Bloom Filters
- Fast existence checks with no false negatives
- Typically ~100KB per index
- Used to skip videographers that don't contain the queried entity

### 2. Time Indexes
- Chronological list of segments
- Enables fast time-range queries
- Typically ~10KB per day

### 3. Content Indexes
- Person appearances with timestamps and confidence scores
- Moment definitions with multi-angle metadata
- Compressed JSON (~1-5MB per index)

### 4. Count-Min Sketches (Future)
- Approximate frequency counting
- Used for ranking results by appearance frequency
- ~200KB per sketch

## Query Performance

Typical query performance on Cloudflare Workers:

| Query Type | Cold Cache | Warm Cache | Notes |
|------------|------------|------------|-------|
| Person search (1 videographer) | ~180ms | ~80ms | With bloom filter |
| Person search (10 videographers) | ~450ms | ~200ms | Parallel fetches |
| Moment lookup | ~120ms | ~60ms | Direct index access |
| List people | ~50ms | ~20ms | From manifest |
| List moments | ~200ms | ~100ms | Aggregated from indexes |

## Caching Strategy

The API uses the following caching strategy:

- **Manifests:** 5 minutes (`Cache-Control: private, max-age=300`)
- **Bloom filters:** 5 minutes
- **Indexes:** 5 minutes
- **Segment data:** Immutable (permanent edge cache)

## Error Responses

All endpoints return JSON error responses:

```json
{
  "error": "Error message",
  "details": "Additional error details (development only)"
}
```

**Common Status Codes:**
- `400` - Bad Request (missing required parameters)
- `401` - Unauthorized (authentication failed)
- `404` - Not Found (wedding, person, or moment not found)
- `500` - Internal Server Error

## Usage Examples

### JavaScript/TypeScript Client

```typescript
// Person search
async function findPerson(personId: string, weddingId: string) {
  const response = await fetch(
    `/api/video/search/person?person_id=${personId}&wedding_id=${weddingId}`
  );

  if (!response.ok) {
    throw new Error(`Search failed: ${response.statusText}`);
  }

  const result = await response.json();
  console.log(`Found ${result.total_clips} clips`);

  // Play first clip
  if (result.results.length > 0 && result.results[0].appearances.length > 0) {
    const firstClip = result.results[0].appearances[0];
    playVideo(firstClip.hls_url);
  }
}

// Multi-angle moment viewer
async function viewMoment(momentId: string, weddingId: string) {
  const response = await fetch(
    `/api/video/search/moment?moment_id=${momentId}&wedding_id=${weddingId}`
  );

  const moment = await response.json();

  // Set up multi-angle player
  moment.angles.forEach(angle => {
    addVideoPlayer({
      videographer: angle.videographer_name,
      angle: angle.angle,
      hlsUrl: angle.segments[0].hls_url
    });
  });
}
```

### React Component Example

```tsx
import { useState, useEffect } from 'react';

function PersonClips({ personId, weddingId }) {
  const [clips, setClips] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadClips() {
      const response = await fetch(
        `/api/video/search/person?person_id=${personId}&wedding_id=${weddingId}`
      );
      const data = await response.json();
      setClips(data);
      setLoading(false);
    }

    loadClips();
  }, [personId, weddingId]);

  if (loading) return <div>Loading...</div>;

  return (
    <div>
      <h2>Found {clips.total_clips} clips ({Math.round(clips.total_duration_seconds / 60)} minutes)</h2>
      {clips.results.map(vg => (
        <div key={vg.videographer_id}>
          <h3>{vg.videographer_name}</h3>
          {vg.appearances.map(app => (
            <VideoThumbnail
              key={app.segment_id}
              thumbnail={app.thumbnail}
              hlsUrl={app.hls_url}
              duration={app.duration}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
```

## Next Steps

For implementation:
1. Generate indexes from video segments (see `packages/shared-video-lib/src/index-builder.ts`)
2. Upload indexes to R2
3. Query using the API endpoints
4. Build UI components to display results

For ML integration (future):
5. Process videos with face detection models
6. Generate person embeddings
7. Build person indexes with confidence scores
8. Enable automatic moment detection

## Related Documentation

- [Video Architecture](./VIDEO_ARCHITECTURE.md) - Overall system design
- [Bloom Filters](../packages/shared-video-lib/src/bloom-filter.ts) - Implementation details
- [Index Builders](../packages/shared-video-lib/src/index-builder.ts) - Building indexes
- [Manifest Types](../packages/shared-video-lib/src/types/manifests.ts) - TypeScript types
