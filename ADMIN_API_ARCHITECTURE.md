# Admin API Architecture - Gallery Image Hiding Feature

## Overview
Add an admin interface to hide/unhide images from the public gallery while maintaining access for administrators.

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                     User Browser                                │
│                                                                  │
│  ┌─────────────────┐         ┌──────────────────────┐          │
│  │ Public Gallery  │         │   Admin Panel        │          │
│  │  (existing)     │         │   (NEW)              │          │
│  │                 │         │                      │          │
│  │ • View visible  │         │ • View all images    │          │
│  │   images only   │         │ • Toggle visibility  │          │
│  │ • Filter by     │         │ • Batch operations   │          │
│  │   hidden=false  │         │ • Preview hidden     │          │
│  └────────┬────────┘         └──────────┬───────────┘          │
│           │                             │                       │
└───────────┼─────────────────────────────┼───────────────────────┘
            │                             │
            │ GET /api/media              │ GET /api/admin/media
            │ (returns visible only)      │ PATCH /api/admin/media/:key
            │                             │ (requires admin auth)
            ▼                             ▼
┌─────────────────────────────────────────────────────────────────┐
│              Cloudflare Pages (Routing Layer)                   │
│                                                                  │
│  Pages Function: api/[[path]].ts                               │
│  ├─ /api/login → Auth (existing)                              │
│  ├─ /api/media → Viewer Worker (MODIFIED)                     │
│  └─ /api/admin/* → Viewer Worker (NEW)                        │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Viewer Worker (MODIFIED)                     │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ Existing Endpoints (MODIFIED)                             │ │
│  │                                                            │ │
│  │ GET /api/media                                            │ │
│  │   ├─ Query D1: SELECT * FROM media WHERE hidden = 0      │ │
│  │   └─ Return only visible images                          │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ NEW Admin Endpoints                                        │ │
│  │                                                            │ │
│  │ GET /api/admin/media                                      │ │
│  │   ├─ Validate admin token/role                           │ │
│  │   ├─ Query D1: SELECT * FROM media (all rows)            │ │
│  │   └─ Return all images with hidden status               │ │
│  │                                                            │ │
│  │ PATCH /api/admin/media/:key                              │ │
│  │   ├─ Validate admin token/role                           │ │
│  │   ├─ Body: { "hidden": true/false }                      │ │
│  │   ├─ UPDATE media SET hidden = ? WHERE key = ?           │ │
│  │   └─ Invalidate cache (bump cache version)              │ │
│  │                                                            │ │
│  │ POST /api/admin/media/batch-hide (optional)              │ │
│  │   ├─ Validate admin token/role                           │ │
│  │   ├─ Body: { "keys": ["img1.jpg", "img2.jpg"] }         │ │
│  │   └─ Bulk UPDATE media SET hidden = 1 WHERE key IN (...)│ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ Authorization Logic (NEW)                                  │ │
│  │                                                            │ │
│  │ validateAdminAccess(request):                             │ │
│  │   ├─ Check admin_auth cookie OR Authorization header     │ │
│  │   ├─ Verify HMAC signature with AUTH_ADMIN_SECRET        │ │
│  │   ├─ Validate admin role claim                           │ │
│  │   └─ Return 403 if unauthorized                          │ │
│  └────────────────────────────────────────────────────────────┘ │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                  Cloudflare Storage (MODIFIED)                  │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ D1 Database: wedding-photos-metadata (MODIFIED SCHEMA)    │ │
│  │                                                            │ │
│  │ ALTER TABLE media ADD COLUMN hidden INTEGER DEFAULT 0;   │ │
│  │                                                            │ │
│  │ CREATE INDEX idx_media_hidden ON media(hidden);          │ │
│  │ CREATE INDEX idx_media_visible                           │ │
│  │   ON media(hidden, date_taken DESC);                     │ │
│  │                                                            │ │
│  │ Schema:                                                    │ │
│  │   key TEXT PRIMARY KEY                                    │ │
│  │   filename TEXT                                           │ │
│  │   type TEXT                                               │ │
│  │   size INTEGER                                            │ │
│  │   uploaded_at TEXT                                        │ │
│  │   date_taken TEXT                                         │ │
│  │   camera_make TEXT                                        │ │
│  │   camera_model TEXT                                       │ │
│  │   width INTEGER                                           │ │
│  │   height INTEGER                                          │ │
│  │   hls_qualities TEXT                                      │ │
│  │   hidden INTEGER DEFAULT 0  ← NEW COLUMN                 │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ KV Namespace: CACHE_VERSION (existing, unchanged)         │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ R2 Bucket: wedding-photos (existing, unchanged)           │ │
│  │   Files remain in storage, just filtered from API         │ │
│  └────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

---

## Key Design Decisions

### 1. **Authentication Strategy**

**Option A: Separate Admin Password (RECOMMENDED)**
```
Environment Variables:
- GALLERY_PASSWORD (existing) - Public gallery access
- ADMIN_PASSWORD (new) - Admin panel access

Auth Flow:
- Admin login at /admin/login with ADMIN_PASSWORD
- Issues admin_auth cookie with role="admin"
- Admin endpoints validate admin role in token
```

**Option B: Role-Based Single Password**
```
Environment Variables:
- GALLERY_PASSWORD (existing) - Public access
- Special prefix for admin: "admin:{ADMIN_PASSWORD}"

Auth Flow:
- Login with "admin:mypassword" → role="admin"
- Login with "mypassword" → role="viewer"
- Admin endpoints check role claim
```

**Recommendation:** Option A (cleaner separation, easier to manage)

---

### 2. **Data Model Changes**

**D1 Migration:**
```sql
-- Add hidden column (default to visible)
ALTER TABLE media ADD COLUMN hidden INTEGER DEFAULT 0;

-- Index for filtering visible images (performance)
CREATE INDEX idx_media_visible ON media(hidden, date_taken DESC);

-- Index for admin panel (show all)
CREATE INDEX idx_media_hidden ON media(hidden);
```

**Why INTEGER instead of BOOLEAN?**
- SQLite uses INTEGER for booleans (0 = false, 1 = true)
- Consistent with SQLite best practices

---

### 3. **API Design**

#### **Public API (Modified)**
```
GET /api/media
  Response: { media: [...] }  // Only images where hidden = 0
  Auth: Regular gallery_auth cookie
```

#### **Admin API (New)**
```
GET /api/admin/media
  Response: {
    media: [
      { key: "img.jpg", hidden: 0, ... },
      { key: "bad.jpg", hidden: 1, ... }  // Shows hidden status
    ]
  }
  Auth: admin_auth cookie with role="admin"

PATCH /api/admin/media/:key
  Body: { "hidden": true }
  Response: { success: true, media: {...} }
  Auth: admin_auth cookie

POST /api/admin/media/batch-update (optional future enhancement)
  Body: { "keys": ["img1.jpg", "img2.jpg"], "hidden": true }
  Response: { success: true, updated: 2 }
  Auth: admin_auth cookie
```

---

### 4. **Frontend Components**

**New Routes:**
```
/admin           → Admin gallery view (with hide/unhide toggles)
/admin/login     → Admin login page
```

**New Components:**
```
pages/gallery/src/components/
├── AdminGallery.tsx          # Gallery with admin controls
├── AdminLogin.tsx            # Admin authentication form
├── MediaCard.tsx             # Image card with visibility toggle
└── VisibilityToggle.tsx      # Hide/unhide button component
```

**UI Features:**
- Toggle visibility icon on each image (eye/eye-slash)
- Visual indicator for hidden images (opacity/badge)
- Bulk selection mode (future enhancement)
- Confirmation dialog before hiding
- Toast notifications for actions

---

### 5. **Security Considerations**

1. **Admin Token Security**
   - Separate signing secret: `AUTH_ADMIN_SECRET`
   - Shorter expiration (7 days vs 30 days for public)
   - HttpOnly, Secure, SameSite=Lax cookies

2. **Authorization Checks**
   - Every admin endpoint validates admin role
   - Constant-time comparison for tokens
   - Rate limiting on admin actions (future)

3. **Audit Logging** (future enhancement)
   - Log hide/unhide actions with timestamp
   - Store in separate D1 table: `admin_actions`
   - Track: action, user, timestamp, media_key

---

## Implementation Phases

### **Phase 1: Database & Backend (Parallel Track A)**
- [ ] Create D1 migration script
- [ ] Add `hidden` column to media table
- [ ] Create indexes for performance
- [ ] Test migration on development database

### **Phase 2: Admin Authentication (Parallel Track B)**
- [ ] Add admin auth logic to `packages/auth`
- [ ] Create admin login endpoint
- [ ] Add admin token validation middleware
- [ ] Test admin authentication flow

### **Phase 3: Admin API Endpoints (Depends on Phase 1 & 2)**
- [ ] Implement `GET /api/admin/media`
- [ ] Implement `PATCH /api/admin/media/:key`
- [ ] Add admin authorization to endpoints
- [ ] Test API with curl/Postman

### **Phase 4: Modify Public API (Depends on Phase 1)**
- [ ] Update `GET /api/media` to filter hidden images
- [ ] Add test coverage for filtering
- [ ] Test with existing frontend

### **Phase 5: Admin Frontend UI (Parallel with Phase 3)**
- [ ] Create AdminLogin component
- [ ] Create AdminGallery component
- [ ] Create VisibilityToggle component
- [ ] Add routing for /admin routes
- [ ] Test admin UI flow

### **Phase 6: Integration & Testing**
- [ ] End-to-end testing (admin hides image → public can't see)
- [ ] Test edge cases (invalid tokens, missing permissions)
- [ ] Performance testing (index effectiveness)
- [ ] Cross-browser testing

### **Phase 7: Deployment**
- [ ] Push to feature branch
- [ ] Test in preview deployment
- [ ] Create PR with documentation
- [ ] Deploy to production via CI/CD

---

## Parallel Execution Plan

```
START
  │
  ├─────────────────────────┬─────────────────────────┬───────────────────────
  │                         │                         │
  ▼                         ▼                         ▼
Phase 1                   Phase 2                   Phase 5
Database Schema           Admin Auth                 Frontend UI
(Track A)                 (Track B)                  (Track C)
  │                         │                         │
  │                         │                         │
  ▼                         ▼                         │
Phase 4                   Phase 3                     │
Public API Filter         Admin API                   │
  │                         │                         │
  └──────────┬──────────────┴─────────────────────────┘
             │
             ▼
          Phase 6
       Integration Testing
             │
             ▼
          Phase 7
         Deployment
```

**Parallelizable Tracks:**
- **Track A:** Database schema changes + public API modification
- **Track B:** Admin authentication logic + admin API endpoints
- **Track C:** Frontend admin UI components

**Critical Path:** Phase 1 → Phase 3 → Phase 6 → Phase 7

**Estimated Timeline:**
- Phase 1: 1-2 hours
- Phase 2: 2-3 hours
- Phase 3: 3-4 hours (depends on 1 & 2)
- Phase 4: 1-2 hours (depends on 1)
- Phase 5: 4-6 hours (parallel)
- Phase 6: 2-3 hours
- Phase 7: 1 hour

**Total:** ~14-21 hours (sequential) | ~10-14 hours (with parallelization)

---

## Files to Create/Modify

### **New Files**
```
workers/viewer/migrations/
  └── 0001_add_hidden_column.sql

pages/gallery/src/components/
  ├── AdminGallery.tsx
  ├── AdminLogin.tsx
  ├── MediaCard.tsx
  └── VisibilityToggle.tsx

workers/viewer/src/handlers/
  └── admin.ts

workers/viewer/src/middleware/
  └── admin-auth.ts
```

### **Modified Files**
```
workers/viewer/src/handlers/media.ts
  └── Update getMedia() to filter hidden images

workers/viewer/src/index.ts
  └── Add admin routes

pages/gallery/src/App.tsx
  └── Add /admin routes

pages/gallery/src/types.ts
  └── Add AdminMediaItem interface

packages/auth/src/index.ts
  └── Add admin token generation/validation

workers/viewer/wrangler.toml
  └── Add AUTH_ADMIN_SECRET binding
```

---

## Environment Variables

**Add to all environments:**
```toml
# Viewer Worker (wrangler.toml)
[vars]
ADMIN_PASSWORD = "your-secure-admin-password"  # Or use secrets
AUTH_ADMIN_SECRET = "different-from-auth-secret"  # Or use secrets
```

**Recommended: Use Wrangler Secrets**
```bash
wrangler secret put ADMIN_PASSWORD --name wedding-gallery-viewer
wrangler secret put AUTH_ADMIN_SECRET --name wedding-gallery-viewer
```

---

## Testing Strategy

### **Unit Tests**
- Admin token generation/validation
- Hidden image filtering logic
- Admin authorization middleware

### **Integration Tests**
- Public API doesn't return hidden images
- Admin API returns all images
- Unauthorized users can't access admin endpoints

### **E2E Tests**
- Admin logs in → sees all images
- Admin hides image → public gallery updates
- Public user can't access admin panel

---

## Future Enhancements

1. **Bulk Operations**
   - Select multiple images
   - Batch hide/unhide

2. **Audit Logging**
   - Track all admin actions
   - Show action history per image

3. **Soft Delete**
   - Add `deleted` column
   - Move to trash before permanent deletion

4. **Advanced Filtering**
   - Hide by date range
   - Hide by camera/location
   - Tags/categories

5. **Admin Dashboard**
   - Statistics (visible/hidden counts)
   - Recent admin actions
   - Storage usage

---

## Security Checklist

- [ ] Admin password stored as secret (not in code)
- [ ] Admin tokens use separate signing key
- [ ] Admin endpoints validate role claim
- [ ] Constant-time token comparison
- [ ] HttpOnly cookies prevent XSS
- [ ] Rate limiting on admin actions
- [ ] CORS headers properly configured
- [ ] Input validation on all endpoints
- [ ] SQL injection prevented (parameterized queries)
- [ ] Audit logging for accountability

---

## Rollback Plan

If issues arise in production:

1. **Immediate Rollback**
   ```bash
   # Revert migration
   wrangler d1 execute wedding-photos-metadata \
     --remote \
     --command "ALTER TABLE media DROP COLUMN hidden"
   ```

2. **Gradual Rollback**
   - Deploy previous worker version
   - Keep schema changes (hidden column defaults to 0)
   - No impact on public users

3. **Data Integrity**
   - Hidden images remain in R2 (no data loss)
   - Public API filtering is non-destructive
