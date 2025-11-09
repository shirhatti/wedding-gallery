# Code Duplication Analysis

## Issue: Duplicate Libraries Between Workers

Currently, the same libraries are duplicated between `viewer` and `video-streaming` workers:

| Library | Lines | Purpose | Duplication |
|---------|-------|---------|-------------|
| `lib/r2-signer.ts` | 132 | AWS SigV4 signing | ✅ Identical |
| `lib/cached-url-signer.ts` | 66 | KV-cached URL signing | ✅ Identical |
| `lib/batch-r2-signer.ts` | 192 | Batch signing | ✅ Identical |
| `lib/optimized-batch-signer.ts` | 229 | Signing key cache | ✅ Identical |
| `lib/m3u8-handler.ts` | 194 | M3U8 parsing | ✅ Identical |
| `lib/progressive-manifest.ts` | 174 | Progressive delivery | ✅ Identical |
| **Total** | **987 lines** | | **100% duplicate** |

## Impact

### Current State ❌
- **Maintenance burden**: Updates must be made in two places
- **Bug risk**: Easy to update one worker but forget the other
- **Bundle size**: Each worker includes full copy (~40KB)
- **Testing**: Same code tested twice

### Risks
1. **Security patches**: Must remember to apply to both workers
2. **Bug fixes**: Missing one location could cause production issues
3. **Feature updates**: Inconsistent behavior if only one is updated

## Solution Options

### Option 1: Shared NPM Workspace Package ⭐ RECOMMENDED

Create `workers/shared-video-lib` as an npm workspace:

```
wedding-gallery/
├── workers/
│   ├── shared-video-lib/          # New shared package
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── r2-signer.ts
│   │       ├── cached-url-signer.ts
│   │       ├── batch-r2-signer.ts
│   │       ├── optimized-batch-signer.ts
│   │       ├── m3u8-handler.ts
│   │       ├── progressive-manifest.ts
│   │       └── index.ts
│   ├── viewer/
│   │   └── package.json          # Depends on shared-video-lib
│   └── video-streaming/
│       └── package.json           # Depends on shared-video-lib
```

**Setup**:
```json
// workers/shared-video-lib/package.json
{
  "name": "@wedding-gallery/shared-video-lib",
  "version": "1.0.0",
  "private": true,
  "main": "src/index.ts",
  "dependencies": {
    "m3u8-parser": "^7.2.0",
    "@types/m3u8-parser": "^7.2.5"
  }
}

// workers/viewer/package.json
{
  "dependencies": {
    "@wedding-gallery/shared-video-lib": "workspace:*"
  }
}

// workers/video-streaming/package.json
{
  "dependencies": {
    "@wedding-gallery/shared-video-lib": "workspace:*"
  }
}
```

**Usage**:
```typescript
// Before
import { signR2Url } from "./lib/r2-signer";

// After
import { signR2Url } from "@wedding-gallery/shared-video-lib";
```

**Benefits**:
- ✅ Single source of truth
- ✅ Type-safe imports
- ✅ Standard npm workflow
- ✅ Easy to test in isolation
- ✅ No build step needed (TypeScript imports)

**Drawbacks**:
- ⚠️ Requires workspace setup (~30 minutes)
- ⚠️ Both workers must update when shared lib changes

---

### Option 2: Monorepo Shared Directory

Create `shared/video-lib/` at root level:

```
wedding-gallery/
├── shared/
│   └── video-lib/
│       ├── r2-signer.ts
│       ├── batch-r2-signer.ts
│       └── ...
├── workers/
│   ├── viewer/
│   │   └── tsconfig.json  # Includes ../../../shared
│   └── video-streaming/
│       └── tsconfig.json  # Includes ../../../shared
```

**tsconfig.json**:
```json
{
  "compilerOptions": {
    "paths": {
      "@shared/*": ["../../shared/*"]
    }
  }
}
```

**Benefits**:
- ✅ Simpler than workspace package
- ✅ Shared across all workers

**Drawbacks**:
- ⚠️ TypeScript path mapping required
- ⚠️ Wrangler may need configuration
- ⚠️ Less explicit dependency management

---

### Option 3: Git Submodule (External Package)

Extract to separate repo and use as submodule:

**Benefits**:
- ✅ Complete isolation
- ✅ Separate versioning
- ✅ Can be reused by other projects

**Drawbacks**:
- ⚠️ Overhead of separate repo
- ⚠️ Submodule complexity
- ⚠️ Not recommended for single project

---

### Option 4: Keep as Duplicates (Current)

Accept the duplication as acceptable technical debt.

**When this is okay**:
- Libraries are stable (rarely change)
- Team is small (easy to remember both locations)
- Workers might diverge in future

**Benefits**:
- ✅ No refactoring needed
- ✅ Workers completely independent

**Drawbacks**:
- ❌ Maintenance burden
- ❌ Bug risk
- ❌ Code bloat

---

## Recommendation

**Use Option 1: Shared NPM Workspace Package**

This is the standard Node.js approach and works perfectly with npm workspaces (already in use).

### Implementation Steps

1. **Create shared package** (10 min)
   ```bash
   mkdir -p workers/shared-video-lib/src
   ```

2. **Move libraries** (5 min)
   ```bash
   mv workers/viewer/src/lib/*.ts workers/shared-video-lib/src/
   ```

3. **Create package.json** (5 min)
   ```bash
   # Add package.json with dependencies
   ```

4. **Update workspace root** (2 min)
   ```json
   // package.json
   {
     "workspaces": [
       "workers/*",
       "pages/*"
     ]
   }
   ```

5. **Update imports in both workers** (10 min)
   ```typescript
   // Find and replace
   import { ... } from "./lib/..."
   // With
   import { ... } from "@wedding-gallery/shared-video-lib"
   ```

6. **Remove duplicate files** (2 min)
   ```bash
   rm -rf workers/viewer/src/lib/{r2-signer,batch-r2-signer,...}.ts
   ```

7. **Test** (5 min)
   ```bash
   npm install
   npm test
   ```

**Total time**: ~40 minutes

---

## Current Status

✅ **Security fixed**: Input validation added to both workers
✅ **Deployment fixed**: video-streaming added to CI/CD
⏳ **Code duplication**: Documented but not yet resolved

## Next Steps

1. Review this analysis
2. Choose an option (recommend Option 1)
3. Implement shared package
4. Update both workers to use it
5. Remove duplicate code
6. Commit and deploy

---

## Files Affected

If implementing shared package:

**New**:
- `workers/shared-video-lib/package.json`
- `workers/shared-video-lib/tsconfig.json`
- `workers/shared-video-lib/src/index.ts` (barrel export)
- `workers/shared-video-lib/src/*.ts` (moved from workers)

**Modified**:
- `workers/viewer/package.json` (add dependency)
- `workers/viewer/src/index.ts` (update imports)
- `workers/video-streaming/package.json` (add dependency)
- `workers/video-streaming/src/index.ts` (update imports)
- `workers/video-streaming/src/handlers/*.ts` (update imports)

**Deleted**:
- `workers/viewer/src/lib/{6 files}.ts`
- `workers/video-streaming/src/lib/{6 files}.ts`
