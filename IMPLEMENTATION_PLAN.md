# Admin API Implementation Plan - Parallelization Strategy

## 🎯 Objective
Add admin functionality to hide/unhide images from the public gallery while maintaining full admin access.

---

## 📊 Parallelization Overview

We can split the work into **3 independent tracks** that can be developed simultaneously:

```
┌─────────────────────┐  ┌─────────────────────┐  ┌─────────────────────┐
│   TRACK A           │  │   TRACK B           │  │   TRACK C           │
│   Database Layer    │  │   Admin Auth        │  │   Frontend UI       │
├─────────────────────┤  ├─────────────────────┤  ├─────────────────────┤
│                     │  │                     │  │                     │
│ 1. D1 Migration     │  │ 1. Auth Package     │  │ 1. AdminLogin.tsx   │
│    - Add hidden col │  │    - Admin tokens   │  │                     │
│    - Create indexes │  │    - Role validation│  │ 2. AdminGallery.tsx │
│                     │  │                     │  │    - List view      │
│ 2. Public API       │  │ 2. Admin Middleware │  │    - Toggle buttons │
│    - Filter hidden  │  │    - Authorization  │  │                     │
│    - Add WHERE      │  │    - Cookie mgmt    │  │ 3. VisibilityToggle │
│                     │  │                     │  │    - Eye icon       │
│ Est: 2-3 hours      │  │ 3. Admin API        │  │    - State mgmt     │
│                     │  │    - GET /admin/    │  │                     │
│                     │  │      media          │  │ 4. Routes           │
│                     │  │    - PATCH /admin/  │  │    - /admin         │
│                     │  │      media/:key     │  │    - /admin/login   │
│                     │  │                     │  │                     │
│                     │  │ Est: 4-5 hours      │  │ Est: 5-6 hours      │
└─────────────────────┘  └─────────────────────┘  └─────────────────────┘
           │                        │                        │
           └────────────────────────┴────────────────────────┘
                                    │
                                    ▼
                    ┌───────────────────────────┐
                    │  INTEGRATION & TESTING    │
                    │  - E2E tests              │
                    │  - Manual QA              │
                    │  - Performance testing    │
                    │  Est: 2-3 hours           │
                    └───────────────────────────┘
                                    │
                                    ▼
                    ┌───────────────────────────┐
                    │      DEPLOYMENT           │
                    │  - Push to branch         │
                    │  - Preview testing        │
                    │  - CI/CD pipeline         │
                    │  Est: 1 hour              │
                    └───────────────────────────┘
```

**Total Time Estimate:**
- Sequential: ~14-18 hours
- Parallel (3 developers): ~7-9 hours
- Parallel (1 developer switching): ~10-12 hours

---

## 🔀 Track A: Database Layer

### Tasks
1. **Create D1 Migration Script** [30 min]
   ```sql
   -- File: workers/viewer/migrations/0001_add_hidden_column.sql
   ALTER TABLE media ADD COLUMN hidden INTEGER DEFAULT 0;
   CREATE INDEX idx_media_visible ON media(hidden, date_taken DESC);
   CREATE INDEX idx_media_hidden ON media(hidden);
   ```

2. **Run Migration on Dev Database** [15 min]
   ```bash
   wrangler d1 execute wedding-photos-metadata \
     --local \
     --file=./migrations/0001_add_hidden_column.sql
   ```

3. **Modify Public Media API** [1-1.5 hours]
   - File: `workers/viewer/src/handlers/media.ts`
   - Change: Add `WHERE hidden = 0` to SQL query
   - Update: Response type definitions

   ```typescript
   // Before
   const { results } = await env.DB.prepare(
     'SELECT * FROM media ORDER BY date_taken DESC'
   ).all();

   // After
   const { results } = await env.DB.prepare(
     'SELECT * FROM media WHERE hidden = 0 ORDER BY date_taken DESC'
   ).all();
   ```

4. **Write Unit Tests** [30 min]
   - Test: Hidden images are filtered
   - Test: Visible images are returned
   - Test: Empty result when all hidden

### Dependencies
- None (can start immediately)

### Deliverables
- Migration script
- Updated `media.ts` handler
- Tests passing

---

## 🔐 Track B: Admin Authentication & API

### Tasks
1. **Extend Auth Package** [1 hour]
   - File: `packages/auth/src/index.ts`
   - Add: `generateAdminToken(audience: string, adminSecret: string)`
   - Add: `validateAdminToken(token: string, audience: string, adminSecret: string)`
   - Add: Role claim to token payload

   ```typescript
   interface TokenPayload {
     audience: string;
     version: string;
     issuedAt: number;
     role: 'viewer' | 'admin';  // NEW
   }
   ```

2. **Create Admin Middleware** [1 hour]
   - File: `workers/viewer/src/middleware/admin-auth.ts`
   - Function: `validateAdminAccess(request: Request, env: Env)`
   - Check: Cookie or Authorization header
   - Verify: HMAC signature with `AUTH_ADMIN_SECRET`
   - Return: 403 if unauthorized

3. **Create Admin Handler** [2-2.5 hours]
   - File: `workers/viewer/src/handlers/admin.ts`

   **Endpoints:**
   ```typescript
   // GET /api/admin/media - List all media (including hidden)
   export async function getAllMedia(
     request: Request,
     env: Env
   ): Promise<Response> {
     // Validate admin access
     await validateAdminAccess(request, env);

     // Query all media
     const { results } = await env.DB.prepare(
       'SELECT * FROM media ORDER BY date_taken DESC'
     ).all();

     return json({ media: results });
   }

   // PATCH /api/admin/media/:key - Toggle visibility
   export async function updateMediaVisibility(
     request: Request,
     env: Env,
     key: string
   ): Promise<Response> {
     await validateAdminAccess(request, env);

     const { hidden } = await request.json();

     await env.DB.prepare(
       'UPDATE media SET hidden = ? WHERE key = ?'
     ).bind(hidden ? 1 : 0, key).run();

     // Invalidate cache
     await invalidateCache(env);

     return json({ success: true });
   }
   ```

4. **Add Admin Routes** [30 min]
   - File: `workers/viewer/src/index.ts`
   - Add routes for admin endpoints

   ```typescript
   // Admin routes
   if (url.pathname === '/api/admin/media' && request.method === 'GET') {
     return adminHandler.getAllMedia(request, env);
   }

   if (url.pathname.startsWith('/api/admin/media/') && request.method === 'PATCH') {
     const key = url.pathname.split('/').pop();
     return adminHandler.updateMediaVisibility(request, env, key);
   }
   ```

5. **Create Admin Login Endpoint** [30 min]
   - File: `pages/gallery/functions/admin-login.ts`
   - Validate `ADMIN_PASSWORD`
   - Generate admin token with role="admin"
   - Set `admin_auth` cookie

### Dependencies
- None (can start immediately)

### Deliverables
- Extended auth package with role support
- Admin middleware for authorization
- Admin API endpoints
- Login endpoint

---

## 🎨 Track C: Frontend UI

### Tasks
1. **Create Type Definitions** [15 min]
   - File: `pages/gallery/src/types.ts`

   ```typescript
   export interface AdminMediaItem extends MediaItem {
     hidden: boolean;
   }

   export interface AdminAuthState {
     isAuthenticated: boolean;
     role: 'viewer' | 'admin' | null;
   }
   ```

2. **Create AdminLogin Component** [1 hour]
   - File: `pages/gallery/src/components/AdminLogin.tsx`
   - Features:
     - Password input field
     - Login button
     - Error handling
     - Redirect after login

   ```tsx
   export function AdminLogin() {
     const [password, setPassword] = useState('');
     const [error, setError] = useState('');
     const navigate = useNavigate();

     const handleLogin = async () => {
       const response = await fetch('/api/admin-login', {
         method: 'POST',
         body: JSON.stringify({ password }),
       });

       if (response.ok) {
         navigate('/admin');
       } else {
         setError('Invalid password');
       }
     };

     return (/* Login form JSX */);
   }
   ```

3. **Create VisibilityToggle Component** [1 hour]
   - File: `pages/gallery/src/components/VisibilityToggle.tsx`
   - Features:
     - Eye icon (visible) / Eye-slash icon (hidden)
     - Click to toggle
     - Loading state
     - Confirmation dialog

   ```tsx
   interface Props {
     mediaKey: string;
     isHidden: boolean;
     onToggle: (key: string, hidden: boolean) => void;
   }

   export function VisibilityToggle({ mediaKey, isHidden, onToggle }: Props) {
     const [loading, setLoading] = useState(false);

     const handleToggle = async () => {
       setLoading(true);
       await fetch(`/api/admin/media/${mediaKey}`, {
         method: 'PATCH',
         body: JSON.stringify({ hidden: !isHidden }),
       });
       onToggle(mediaKey, !isHidden);
       setLoading(false);
     };

     return (
       <button onClick={handleToggle} disabled={loading}>
         {isHidden ? <EyeSlashIcon /> : <EyeIcon />}
       </button>
     );
   }
   ```

4. **Create AdminGallery Component** [2-2.5 hours]
   - File: `pages/gallery/src/components/AdminGallery.tsx`
   - Features:
     - Fetch all media (including hidden)
     - Display in masonry grid (reuse Gallery layout)
     - Add VisibilityToggle to each card
     - Visual indicator for hidden images (opacity/badge)
     - Filter toggle (show all / show hidden only)

   ```tsx
   export function AdminGallery() {
     const [media, setMedia] = useState<AdminMediaItem[]>([]);
     const [filter, setFilter] = useState<'all' | 'hidden'>('all');

     useEffect(() => {
       fetch('/api/admin/media')
         .then(res => res.json())
         .then(data => setMedia(data.media));
     }, []);

     const handleToggle = (key: string, hidden: boolean) => {
       setMedia(prev =>
         prev.map(m => m.key === key ? { ...m, hidden } : m)
       );
     };

     const filteredMedia = filter === 'hidden'
       ? media.filter(m => m.hidden)
       : media;

     return (
       <div>
         <FilterControls filter={filter} setFilter={setFilter} />
         <GalleryGrid media={filteredMedia} onToggle={handleToggle} />
       </div>
     );
   }
   ```

5. **Add Admin Routes** [30 min]
   - File: `pages/gallery/src/App.tsx`

   ```tsx
   import { AdminLogin } from './components/AdminLogin';
   import { AdminGallery } from './components/AdminGallery';

   function App() {
     return (
       <Router>
         <Routes>
           <Route path="/" element={<Gallery />} />
           <Route path="/login" element={<Login />} />
           <Route path="/admin/login" element={<AdminLogin />} />
           <Route path="/admin" element={<AdminGallery />} />
         </Routes>
       </Router>
     );
   }
   ```

6. **Add Styling** [1 hour]
   - Hidden image overlay/badge
   - Toggle button styles
   - Admin panel layout
   - Responsive design

### Dependencies
- None (can start immediately, mock API responses for development)

### Deliverables
- AdminLogin component
- AdminGallery component
- VisibilityToggle component
- Routes configured
- Styled UI

---

## 🧪 Integration & Testing Phase

### Prerequisites
- All 3 tracks completed
- Local development environment running

### Tasks
1. **Database Setup** [15 min]
   - Run migration on local D1
   - Seed test data with mix of visible/hidden

2. **Environment Variables** [15 min]
   ```bash
   # Add to .dev.vars
   ADMIN_PASSWORD=test-admin-password
   AUTH_ADMIN_SECRET=test-admin-secret-different-from-gallery
   ```

3. **E2E Testing** [1.5 hours]
   - [ ] Public gallery shows only visible images
   - [ ] Admin login with correct password succeeds
   - [ ] Admin login with wrong password fails
   - [ ] Admin gallery shows all images
   - [ ] Toggle image to hidden → disappears from public gallery
   - [ ] Toggle image to visible → reappears in public gallery
   - [ ] Unauthorized user can't access /api/admin/* endpoints
   - [ ] Hidden images still accessible by direct URL (security check)

4. **Performance Testing** [30 min]
   - [ ] Query performance with indexes
   - [ ] Cache invalidation works correctly
   - [ ] No N+1 query issues

5. **Manual QA** [30 min]
   - [ ] Test on mobile devices
   - [ ] Test on different browsers
   - [ ] Test with large galleries (100+ images)
   - [ ] Test concurrent admin actions

---

## 🚀 Deployment Phase

### Tasks
1. **Create Feature Branch** [5 min]
   ```bash
   git checkout -b claude/add-gallery-admin-api-011CUyG9Nop6M2sxnT11sCWJ
   ```

2. **Commit Changes** [10 min]
   ```bash
   git add .
   git commit -m "Add admin API for hiding images from gallery

   - Add hidden column to media table with indexes
   - Implement admin authentication with separate password
   - Create admin API endpoints (GET /api/admin/media, PATCH /api/admin/media/:key)
   - Add admin UI with visibility toggle
   - Filter hidden images from public gallery API
   - Add comprehensive tests"
   ```

3. **Push to Remote** [5 min]
   ```bash
   git push -u origin claude/add-gallery-admin-api-011CUyG9Nop6M2sxnT11sCWJ
   ```

4. **Set Production Secrets** [10 min]
   ```bash
   # Viewer Worker
   wrangler secret put ADMIN_PASSWORD --name wedding-gallery-viewer
   wrangler secret put AUTH_ADMIN_SECRET --name wedding-gallery-viewer

   # Pages (if needed)
   wrangler pages secret put ADMIN_PASSWORD --project-name=wedding-gallery
   wrangler pages secret put AUTH_ADMIN_SECRET --project-name=wedding-gallery
   ```

5. **Test Preview Deployment** [20 min]
   - Wait for CI to deploy preview
   - Test admin login on preview
   - Test hiding/unhiding images
   - Verify public gallery filtering

6. **Create Pull Request** [10 min]
   - Link to architecture document
   - Add screenshots of admin UI
   - List testing performed
   - Note breaking changes (if any)

---

## 📋 Checklist Summary

### Track A (Database)
- [ ] Create migration script
- [ ] Test migration locally
- [ ] Update public media handler
- [ ] Add WHERE clause filtering
- [ ] Write unit tests
- [ ] Verify indexes improve performance

### Track B (Auth & API)
- [ ] Extend auth package with roles
- [ ] Create admin middleware
- [ ] Implement GET /api/admin/media
- [ ] Implement PATCH /api/admin/media/:key
- [ ] Create admin login endpoint
- [ ] Add routes to worker
- [ ] Write API tests

### Track C (Frontend)
- [ ] Create type definitions
- [ ] Build AdminLogin component
- [ ] Build VisibilityToggle component
- [ ] Build AdminGallery component
- [ ] Add admin routes to App
- [ ] Style components
- [ ] Add loading/error states

### Integration
- [ ] Run migration on dev database
- [ ] Set environment variables
- [ ] E2E testing (all scenarios)
- [ ] Performance testing
- [ ] Cross-browser testing
- [ ] Mobile testing

### Deployment
- [ ] Create feature branch
- [ ] Commit all changes
- [ ] Push to remote
- [ ] Set production secrets
- [ ] Test preview deployment
- [ ] Create pull request

---

## 🎯 Recommended Development Order (Solo Developer)

If working alone, this order minimizes context switching:

### Day 1: Backend Foundation (4-5 hours)
1. **Track A** (Database)
   - Create migration
   - Update public API
   - Test filtering

2. **Track B** (Admin Auth - Part 1)
   - Extend auth package
   - Create admin middleware

### Day 2: Backend Completion (3-4 hours)
3. **Track B** (Admin Auth - Part 2)
   - Implement admin API endpoints
   - Add admin login endpoint
   - Write tests

### Day 3: Frontend (5-6 hours)
4. **Track C** (UI)
   - Create all components
   - Add routes
   - Style UI

### Day 4: Polish & Deploy (3-4 hours)
5. **Integration**
   - E2E testing
   - Bug fixes
   - Performance optimization

6. **Deployment**
   - Push to branch
   - Preview testing
   - Create PR

---

## 💡 Tips for Parallel Development

### If Multiple Developers
- **Developer 1:** Track A + Track B (backend specialist)
- **Developer 2:** Track C (frontend specialist)
- **Developer 3:** Testing & documentation

### Shared Resources
- Use **feature flags** to enable/disable admin UI during development
- Share **API contracts** early (OpenAPI spec)
- Use **mock data** for frontend development
- Set up **local D1 instances** for each developer

### Communication
- Daily sync on integration points
- Shared testing checklist
- Common .dev.vars configuration

---

## 🔒 Security Reminders

- [ ] Never commit `ADMIN_PASSWORD` or secrets
- [ ] Use different `AUTH_ADMIN_SECRET` from `AUTH_SECRET`
- [ ] Validate admin role on every admin endpoint
- [ ] Use parameterized queries (prevent SQL injection)
- [ ] Set HttpOnly cookies (prevent XSS)
- [ ] Add CSRF protection (future)
- [ ] Rate limit admin actions (future)

---

## 📚 Additional Resources

- [Architecture Document](./ADMIN_API_ARCHITECTURE.md) - Detailed design
- [Cloudflare D1 Docs](https://developers.cloudflare.com/d1/)
- [Cloudflare Workers Auth](https://developers.cloudflare.com/workers/runtime-apis/request/)
- [React Router v6](https://reactrouter.com/)

---

**Ready to start implementation!** 🚀
