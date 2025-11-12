# Facial Recognition Enhancement Proposal

## Overview
Enhance the wedding gallery processing pipeline to include facial recognition, allowing guests to find all photos they appear in automatically.

---

## 1. Database Schema Changes

### New Tables

```prisma
// Person represents a unique individual detected across multiple photos
model Person {
  id          String   @id @default(uuid())
  name        String?  // Optional: guest can claim/name themselves
  coverFaceId String?  // Best face photo to represent this person
  photoCount  Int      @default(0)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  faces       Face[]

  @@map("people")
}

// Face represents a single detected face in a photo
model Face {
  id          String   @id @default(uuid())
  mediaKey    String   // Foreign key to Media
  personId    String?  // Foreign key to Person (null if unassigned)

  // Bounding box coordinates (relative to image dimensions)
  x           Float    // Top-left X (0-1)
  y           Float    // Top-left Y (0-1)
  width       Float    // Width (0-1)
  height      Float    // Height (0-1)

  // Face quality metrics
  confidence  Float    // Detection confidence (0-1)
  blur        Float?   // Blur score (higher = blurrier)
  brightness  Float?   // Face brightness

  // Face embedding vector (128 or 512 dimensions depending on model)
  // Stored in SQLite-vec virtual table
  embeddingId String?  @unique

  createdAt   DateTime @default(now())

  media       Media    @relation(fields: [mediaKey], references: [key], onDelete: Cascade)
  person      Person?  @relation(fields: [personId], references: [id], onDelete: SetNull)

  @@index([mediaKey])
  @@index([personId])
  @@map("faces")
}

// SQLite-vec virtual table for face embeddings
// This is created via raw SQL, not Prisma:
// CREATE VIRTUAL TABLE face_embeddings USING vec0(
//   embedding float[128]  -- or float[512] for higher accuracy models
// );
```

### Extensions to Existing Tables

```prisma
model Media {
  // ... existing fields ...

  faceCount   Int?     // Number of faces detected
  facesProcessedAt DateTime?  // When face detection was run

  faces       Face[]   // Relation to detected faces
}
```

---

## 2. Face Detection Options

### Option A: Python-based (Most Accurate) ⭐ RECOMMENDED

**Libraries:**
- `face_recognition` (dlib-based, 99.38% accuracy)
- `deepface` (supports multiple models: VGG-Face, Facenet, ArcFace)

**Pros:**
- Best accuracy (99.38% on LFW benchmark)
- Mature, well-tested libraries
- Rich ecosystem (dlib, OpenCV)
- GPU acceleration available

**Cons:**
- Requires Python runtime in GitHub Actions
- Slightly larger dependencies (~200MB with dlib)

**Implementation:**
```python
import face_recognition

# Load image
image = face_recognition.load_image_file(buffer)

# Detect faces (HOG or CNN)
face_locations = face_recognition.face_locations(image, model="cnn")
face_encodings = face_recognition.face_encodings(image, face_locations)

# Returns 128-dimensional vectors
```

---

### Option B: JavaScript-based (Current Stack)

**Libraries:**
- `face-api.js` (TensorFlow.js, 99.38% accuracy)
- `@vladmandic/face-api` (modern fork, actively maintained)

**Pros:**
- Stay in Node.js ecosystem
- Same accuracy as Python (99.38%)
- No language switching
- Works with existing Sharp pipeline

**Cons:**
- Larger model files (~6.2MB)
- Slower CPU inference vs native Python/dlib
- Less mature than Python libraries

**Implementation:**
```javascript
import * as faceapi from '@vladmandic/face-api';

// Load models (once at startup)
await faceapi.nets.ssdMobilenetv1.loadFromDisk('./models');
await faceapi.nets.faceLandmark68Net.loadFromDisk('./models');
await faceapi.nets.faceRecognitionNet.loadFromDisk('./models');

// Detect faces
const detections = await faceapi
  .detectAllFaces(buffer)
  .withFaceLandmarks()
  .withFaceDescriptors();

// Returns 128-dimensional descriptors
```

---

### Option C: Cloudflare AI (Serverless)

**Model:** RetinaFace for face detection

**Pros:**
- Serverless, no compute cost in CI
- Built-in Cloudflare integration
- Fast inference on GPU

**Cons:**
- Only face detection (bounding boxes), NOT recognition
- No face embeddings/encodings for similarity matching
- Would need separate embedding model

**Verdict:** Not suitable for facial recognition (only detection)

---

### Option D: LLM Vision APIs (GPT-4V, Claude 3.5 Sonnet)

**Pros:**
- Can detect faces and describe people
- Could generate semantic tags ("person wearing blue suit")
- User has API keys available

**Cons:**
- Very expensive at scale (hundreds of photos)
- Slower than dedicated face models
- Not optimized for face embeddings/clustering
- Overkill for face matching

**Verdict:** Better for semantic tagging, not face recognition

---

## 3. Recommended Architecture: Hybrid Approach

### Phase 1: Face Detection + Embedding (Python on Custom Runner)

Use **Python face_recognition** on custom runner with GPU:

```yaml
# .github/workflows/generate-thumbnails.yml
jobs:
  generate:
    runs-on: self-hosted  # Use custom runner
    steps:
      - name: Setup Python
        uses: actions/setup-python@v5
        with:
          python-version: '3.11'

      - name: Install face recognition dependencies
        run: |
          pip install face-recognition deepface pillow numpy

      - name: Process pending thumbnails with ML
        run: node scripts/generate-thumbnails-ml-enhanced.mjs
```

**New Script: `scripts/generate-thumbnails-ml-enhanced.mjs`**

1. Process media as usual (thumbnails, EXIF)
2. Call Python subprocess for face detection:
   ```bash
   python scripts/detect-faces.py --image-path /tmp/photo.jpg
   ```
3. Python script returns JSON:
   ```json
   {
     "faces": [
       {
         "box": [x, y, width, height],
         "embedding": [128 float values],
         "confidence": 0.98,
         "landmarks": {...}
       }
     ]
   }
   ```
4. Store faces in D1 with SQLite-vec embeddings
5. Cluster faces by similarity (cosine distance < 0.6 = same person)

---

### Phase 2: Face Clustering Algorithm

```javascript
// Simplified clustering approach
async function clusterFaces(newFaces, existingPeople, threshold = 0.6) {
  for (const face of newFaces) {
    let bestMatch = null;
    let bestDistance = Infinity;

    // Query SQLite-vec for nearest neighbors
    const neighbors = await db.prepare(`
      SELECT person_id, distance
      FROM face_embeddings
      WHERE embedding MATCH ?
      ORDER BY distance
      LIMIT 5
    `).bind(face.embedding).all();

    if (neighbors[0]?.distance < threshold) {
      // Assign to existing person
      bestMatch = neighbors[0].person_id;
    } else {
      // Create new person
      bestMatch = await createNewPerson();
    }

    await assignFaceToPerson(face.id, bestMatch);
  }
}
```

---

## 4. Processing Workflow

```
┌─────────────┐
│ Guest Upload│
└──────┬──────┘
       │
       ▼
┌──────────────────┐
│pending_thumbnails│
└──────┬───────────┘
       │
       ▼ [GitHub Actions - Hourly]
┌────────────────────────────┐
│ 1. Download from R2        │
│ 2. Generate Thumbnails     │
│ 3. Extract EXIF            │
└────────┬───────────────────┘
         │
         ▼
┌────────────────────────────┐
│ 4. Face Detection (Python) │
│    - Detect faces          │
│    - Extract embeddings    │
│    - Quality scoring       │
└────────┬───────────────────┘
         │
         ▼
┌────────────────────────────┐
│ 5. Store in D1             │
│    - Insert Face records   │
│    - Store embeddings in   │
│      SQLite-vec            │
└────────┬───────────────────┘
         │
         ▼
┌────────────────────────────┐
│ 6. Cluster Faces           │
│    - Vector similarity     │
│    - Assign to Person      │
│    - Update counts         │
└────────┬───────────────────┘
         │
         ▼
┌────────────────────────────┐
│ 7. Update Media table      │
│    - faceCount             │
│    - facesProcessedAt      │
└────────────────────────────┘
```

---

## 5. Frontend Features to Add

### 5.1 Person Gallery View

```typescript
// New route: /people
<PersonGallery>
  {people.map(person => (
    <PersonCard
      coverPhoto={person.coverFace}
      photoCount={person.photoCount}
      onClick={() => navigate(`/person/${person.id}`)}
    />
  ))}
</PersonGallery>
```

### 5.2 Person Detail Page

```typescript
// Route: /person/:id
<PersonDetail>
  <PersonInfo name={person.name || "Unknown"} />
  <PhotoGrid photos={photosWithThisPerson} />
  <ClaimPersonButton onClick={handleClaim} />
</PersonDetail>
```

### 5.3 Face Tagging in Lightbox

```tsx
// Enhanced Lightbox component
<Lightbox>
  <Image src={photo.url} />
  {photo.faces.map(face => (
    <FaceBoundingBox
      x={face.x}
      y={face.y}
      width={face.width}
      height={face.height}
      person={face.person}
    />
  ))}
</Lightbox>
```

### 5.4 "Find Yourself" Feature

```tsx
<SearchBar>
  <Button onClick={handleFindMe}>
    📸 Find photos of me
  </Button>
</SearchBar>

// Uploads a selfie → compares to all face embeddings → shows matches
```

---

## 6. API Endpoints to Add

### Viewer Worker Extensions

```typescript
// GET /api/people - List all detected people
// GET /api/person/:id - Get person details
// GET /api/person/:id/photos - Photos with this person
// GET /api/media/:key/faces - Get faces in a photo
// POST /api/person/:id/claim - Guest claims a person ID
// POST /api/face/upload - Upload selfie to find yourself
```

---

## 7. Performance Considerations

### Storage Impact

| Item | Size | Per Photo | 1000 Photos |
|------|------|-----------|-------------|
| Face embedding (128D) | 512 bytes | ~1.5 KB (3 faces avg) | 1.5 MB |
| Face metadata | ~200 bytes | ~600 bytes | 600 KB |
| **Total** | | ~2.1 KB | **2.1 MB** |

**Verdict:** Very lightweight! D1 can easily handle millions of faces.

### Processing Time

| Task | Time per Photo | Bottleneck |
|------|----------------|------------|
| Thumbnail generation | ~500ms | CPU |
| Face detection (CPU) | ~2-3s | CPU |
| Face detection (GPU) | ~200-500ms | GPU |
| Embedding extraction | ~100ms | Included |
| Clustering | ~50ms | I/O |
| **Total (CPU)** | ~3-4s | |
| **Total (GPU)** | ~1-2s | |

**Optimization:** Process 10 photos in parallel → 100 photos in ~20-40 seconds

### Costs

| Resource | Cost | Notes |
|----------|------|-------|
| Custom runner | $0 (owned) | User has dedicated compute |
| D1 storage | ~$0.01/GB | Face embeddings very small |
| D1 reads | $0.001/1M | Vector searches are cheap |
| Cloudflare AI | N/A | Not using for face recognition |

---

## 8. Implementation Plan

### Week 1: Database & Infrastructure
- [ ] Add Prisma schema for Person, Face tables
- [ ] Create SQLite-vec virtual table for embeddings
- [ ] Run migrations on D1
- [ ] Setup Python environment in custom runner

### Week 2: Face Detection Pipeline
- [ ] Write Python face detection script
- [ ] Enhance thumbnail generation script to call Python
- [ ] Store faces and embeddings in D1
- [ ] Test on sample photos

### Week 3: Face Clustering
- [ ] Implement vector similarity search with SQLite-vec
- [ ] Build clustering algorithm
- [ ] Assign faces to people
- [ ] Optimize batch processing

### Week 4: Frontend Features
- [ ] Add Person Gallery view
- [ ] Add Person Detail page
- [ ] Add face bounding boxes in Lightbox
- [ ] Add "Find yourself" feature
- [ ] Add person claiming/naming

### Week 5: Polish & Testing
- [ ] Handle edge cases (no faces, occlusions)
- [ ] Performance optimization
- [ ] Privacy controls (blur faces, hide from gallery)
- [ ] Documentation

---

## 9. Privacy Considerations

### Data Storage
- Face embeddings are mathematical vectors (not images)
- Cannot reconstruct face image from embedding
- No biometric data leaves your infrastructure

### Guest Controls
- Opt-out: "Hide my face from search"
- Delete: "Remove my face data"
- Blur: "Blur my face in public gallery"

### Implementation
```prisma
model Person {
  // ... existing fields ...

  hiddenFromSearch Boolean @default(false)
  blurInGallery    Boolean @default(false)
}
```

---

## 10. Alternative: Lightweight JS-only Approach

If you want to avoid Python complexity:

```bash
npm install @vladmandic/face-api
```

**Pros:**
- No Python dependency
- Same accuracy (99.38%)
- Stays in current Node.js stack

**Cons:**
- Slower on CPU (~5-10s per photo)
- Mitigated by custom runner's powerful CPU

---

## Recommendation

**Go with Option A (Python face_recognition)** because:

1. ✅ You have custom runner with GPU/CPU
2. ✅ Most accurate and battle-tested
3. ✅ Fastest inference
4. ✅ Best for wedding galleries (need high accuracy)
5. ✅ Easy to call from Node.js via subprocess

**Fallback:** Use `@vladmandic/face-api` if Python setup is problematic.

---

## Next Steps

1. **Confirm approach** - Python vs JS?
2. **Create database migration** - Add Person/Face tables
3. **Setup SQLite-vec** - Test vector search
4. **Write face detection script** - Python or JS
5. **Enhance processing pipeline** - Integrate face detection
6. **Build frontend features** - Person gallery, search

Let me know which option you prefer and I'll start implementing! 🚀
