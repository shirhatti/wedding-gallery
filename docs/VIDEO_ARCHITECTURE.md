# Wedding Video Storage & Query Architecture

## Overview

This document describes the video content storage and indexing system for the wedding gallery, adapted from HLS-inspired hierarchical indexing patterns. The system enables fast, content-based queries across multiple videographers and wedding moments.

## Wedding Context Adaptations

| Security Camera Concept | Wedding Gallery Equivalent |
|------------------------|---------------------------|
| Organization | Wedding Event |
| Camera | Videographer/Camera Operator |
| Face Detection | Person Recognition (bride, groom, family, guests) |
| Object Detection | Wedding Elements (bouquet, rings, cake, decorations) |
| Events | Wedding Moments (ceremony, first dance, speeches, etc.) |
| Cross-camera tracking | Multi-angle synchronization |

## Storage Hierarchy

```
/{wedding_id}/
├── manifest.json                      # Wedding-level entry point
├── videographers/
│   ├── {videographer_id}/
│   │   ├── manifest.json              # Videographer-level manifest
│   │   ├── indices/
│   │   │   ├── time/                  # Time-based indexes
│   │   │   │   ├── timeline.json.gz   # Full wedding timeline
│   │   │   │   └── live.json          # Recent uploads
│   │   │   ├── content/               # Content-based indexes
│   │   │   │   ├── bloom/
│   │   │   │   │   ├── people.bloom   # Person existence check
│   │   │   │   │   ├── moments.bloom  # Moment/event existence
│   │   │   │   │   └── global.bloom   # All-time coarse filter
│   │   │   │   ├── sketches/
│   │   │   │   │   └── counts.cms     # Frequency counts
│   │   │   │   ├── people/
│   │   │   │   │   └── index.json.gz  # Person appearances
│   │   │   │   ├── moments/
│   │   │   │   │   └── index.json.gz  # Wedding moment index
│   │   │   │   └── transcript/
│   │   │   │       └── index.json.gz  # Audio transcripts (speeches)
│   │   │   └── events/                # High-level moment markers
│   │   │       └── index.json.gz
│   │   └── segments/
│   │       └── {segment_id}/
│   │           ├── manifest.json      # Segment metadata
│   │           ├── video.m4s          # Video data (fMP4)
│   │           ├── video-low.m4s      # Lower quality variant
│   │           ├── audio.m4a          # Separate audio track
│   │           ├── detections.json.gz # ML detection results
│   │           ├── thumbnail.jpg      # Preview image
│   │           └── keyframes/         # I-frame extracts
│   │               ├── 0000.jpg
│   │               ├── 0030.jpg
│   │               └── ...
└── global/
    ├── people/                        # Cross-videographer person tracking
    │   └── {person_id}.json           # All appearances of a person
    ├── moments/                       # Cross-videographer moment correlation
    │   └── {moment_id}.json           # Multi-angle views
    └── bloom/
        └── people-global.bloom        # Global person existence check
```

## Key Use Cases

### 1. Find All Clips of the Bride
"Show me every moment the bride appears in any videographer's footage"

### 2. Multi-Angle Event View
"Show me the first dance from all available camera angles"

### 3. Timeline Navigation
"Show me all footage from 3pm-4pm (ceremony time)"

### 4. Speech Search
"Find the moment when the best man said 'college days'"

### 5. Person Journey
"Track the groom's path through the wedding timeline"

## Data Models

### Wedding Manifest
```json
{
  "version": "1.0",
  "wedding_id": "smith-jones-2025",
  "wedding_name": "Sarah & Michael's Wedding",
  "wedding_date": "2025-06-15",
  "location": "Napa Valley, CA",
  "videographers": [
    {
      "id": "videographer_main",
      "name": "Main Camera (Professional)",
      "operator": "John's Video Productions",
      "role": "primary"
    },
    {
      "id": "videographer_guest_1",
      "name": "Guest Camera 1",
      "operator": "Friend's iPhone",
      "role": "guest"
    }
  ],
  "timeline": {
    "ceremony_start": "2025-06-15T15:00:00Z",
    "ceremony_end": "2025-06-15T15:45:00Z",
    "reception_start": "2025-06-15T18:00:00Z",
    "reception_end": "2025-06-15T23:00:00Z"
  },
  "key_people": [
    {"id": "person_bride", "name": "Sarah", "role": "bride"},
    {"id": "person_groom", "name": "Michael", "role": "groom"},
    {"id": "person_moh", "name": "Jessica", "role": "maid_of_honor"},
    {"id": "person_bestman", "name": "Tom", "role": "best_man"}
  ]
}
```

### Person Index
```json
{
  "person_id": "person_bride",
  "name": "Sarah",
  "total_appearances": 342,
  "total_duration_seconds": 4580,
  "videographers_seen": ["videographer_main", "videographer_guest_1"],
  "appearances": [
    {
      "videographer_id": "videographer_main",
      "segment_id": "seg_ceremony_001",
      "time_range": {
        "start": "2025-06-15T15:00:00Z",
        "end": "2025-06-15T15:02:30Z"
      },
      "frame_count": 450,
      "confidence_avg": 0.96,
      "thumbnail_uri": "videographers/videographer_main/segments/seg_ceremony_001/people/person_bride.jpg",
      "moment": "ceremony_entrance"
    }
  ]
}
```

### Moment Index
```json
{
  "moment_id": "first_dance",
  "name": "First Dance",
  "moment_type": "reception_event",
  "start_time": "2025-06-15T19:30:00Z",
  "end_time": "2025-06-15T19:34:30Z",
  "duration_seconds": 270,
  "videographers": [
    {
      "videographer_id": "videographer_main",
      "segments": ["seg_reception_015", "seg_reception_016"],
      "angle": "front",
      "quality": "4K"
    },
    {
      "videographer_id": "videographer_guest_1",
      "segments": ["seg_guest1_042"],
      "angle": "side",
      "quality": "1080p"
    }
  ],
  "people_featured": ["person_bride", "person_groom"],
  "tags": ["dance", "romantic", "reception_highlight"]
}
```

## Query Examples

### Query: Find Person
```
GET /api/video/search/person?person_id=person_bride&wedding_id=smith-jones-2025

Response:
{
  "person_id": "person_bride",
  "name": "Sarah",
  "results": [
    {
      "videographer_id": "videographer_main",
      "videographer_name": "Main Camera",
      "appearances": [
        {
          "segment_id": "seg_ceremony_001",
          "timestamp": "2025-06-15T15:00:00Z",
          "duration": 150,
          "thumbnail": "...",
          "moment": "ceremony_entrance"
        }
      ]
    }
  ],
  "total_clips": 45,
  "total_duration_seconds": 4580
}
```

### Query: Find Moment Multi-Angle
```
GET /api/video/search/moment?moment_id=first_dance&wedding_id=smith-jones-2025

Response:
{
  "moment_id": "first_dance",
  "name": "First Dance",
  "angles": [
    {
      "videographer_id": "videographer_main",
      "angle": "front",
      "segments": [
        {
          "segment_id": "seg_reception_015",
          "start": "2025-06-15T19:30:00Z",
          "duration": 60,
          "hls_url": "/api/hls/...",
          "thumbnail": "..."
        }
      ]
    },
    {
      "videographer_id": "videographer_guest_1",
      "angle": "side",
      "segments": [...]
    }
  ]
}
```

## Implementation Phases

### Phase 1: Foundation (Current)
- ✅ HLS streaming infrastructure
- ✅ R2 storage
- ✅ Basic video metadata

### Phase 2: Storage Hierarchy (In Progress)
- 📝 Manifest system
- 📝 Segment metadata
- 📝 Database schema extensions

### Phase 3: Indexing System
- 📝 Bloom filters
- 📝 Time-based indexes
- 📝 Content indexes (people, moments)

### Phase 4: Query API
- 📝 Person search
- 📝 Moment search
- 📝 Timeline navigation
- 📝 Multi-angle synchronization

### Phase 5: Advanced Features (Future)
- ⏭️ ML integration (face detection, object recognition)
- ⏭️ Audio transcription (for speech search)
- ⏭️ Automatic moment detection
- ⏭️ Smart highlight generation

## Performance Targets

| Query Type | Target Time | Notes |
|------------|-------------|-------|
| Person search | < 500ms | With bloom filter pre-check |
| Moment lookup | < 200ms | Direct index access |
| Timeline query | < 300ms | Time-based index |
| Multi-angle sync | < 400ms | Parallel fetches |

## Storage Overhead

| Component | Size per Hour of Video | Notes |
|-----------|------------------------|-------|
| Raw video (HLS) | ~2GB | Existing |
| Indexes | ~50MB | < 2.5% overhead |
| Bloom filters | ~500KB | Minimal |
| Thumbnails | ~20MB | Existing |

Total index overhead: **~70MB per hour** (~3.5% of video size)
