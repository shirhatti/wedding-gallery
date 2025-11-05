# Apple TV Gallery App - Architecture Approaches

## Background

The current web gallery is built with:
- **Framework**: Vanilla JavaScript (no framework dependencies)
- **Backend**: Cloudflare Workers + R2 storage + D1 database
- **API Endpoints**: Clean REST API for media listing, thumbnails, and HLS video streaming
- **Features**:
  - Responsive CSS Grid layout with lazy loading
  - 3-tier thumbnail optimization (small/medium/large WebP)
  - HLS adaptive video streaming with multi-bitrate support
  - Lightbox viewer with keyboard navigation
  - ETag caching with 30-day cache duration

## Goal

Create an Apple TV app that:
1. **Maximizes code sharing** with existing web UI
2. **Maximizes performance** and native platform features
3. **Delivers smooth scrolling** and buttery navigation
4. Provides an excellent 10-foot viewing experience

## Approach Options

### Option 1: Native tvOS (Swift/SwiftUI) ⭐ **RECOMMENDED**

**Description**: Build a native tvOS app using Swift and SwiftUI

**Code Sharing**:
- ✅ Reuse all existing APIs (`/api/media`, `/api/thumbnail`, `/api/hls`)
- ✅ Share video HLS infrastructure (no changes needed)
- ✅ Share thumbnail generation logic (server-side)
- ❌ Rewrite UI layer entirely in Swift/SwiftUI
- **Estimated sharing**: ~70% (all backend, 0% frontend)

**Performance**:
- ✅ Native performance with Metal acceleration
- ✅ Built-in focus engine for remote control navigation
- ✅ UICollectionView with prefetching for buttery scrolling
- ✅ AVKit for hardware-accelerated video playback
- ✅ Image caching with NSCache/URLCache
- ✅ Parallax effects and animations out of the box

**Implementation Details**:
```swift
// Example grid layout with SwiftUI
struct GalleryGrid: View {
    @State private var media: [MediaItem] = []

    var body: some View {
        ScrollView {
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 300))]) {
                ForEach(media) { item in
                    AsyncImage(url: item.thumbnailURL) { image in
                        image.resizable()
                             .aspectRatio(contentMode: .fill)
                             .focusable()
                    }
                }
            }
        }
    }
}
```

**Pros**:
- Best performance and smoothest scrolling
- Apple TV features: Siri, Top Shelf, Picture-in-Picture, SharePlay
- Focus engine handles remote navigation automatically
- Native video player with seek preview thumbnails
- App Store distribution
- Works offline with local caching

**Cons**:
- Must learn Swift/SwiftUI if not already familiar
- Separate codebase for UI layer
- Requires Xcode and Apple Developer account ($99/year)
- Additional maintenance overhead

**Effort**: Medium (2-3 weeks for MVP)

---

### Option 2: TVML/TVJS (Apple's Web Framework for tvOS)

**Description**: Use Apple's TVML (TV Markup Language) and TVJS (JavaScript for TV) to build a web-based tvOS app

**Code Sharing**:
- ✅ Reuse all existing APIs
- ✅ Reuse JavaScript logic for data fetching
- ✅ Share some DOM manipulation patterns
- ⚠️ Must rewrite UI in TVML (XML-based markup)
- **Estimated sharing**: ~50% (backend + some JS, but TVML is unique)

**Performance**:
- ⚠️ Good but not native-level
- ✅ Apple-optimized JavaScript engine
- ✅ Smooth scrolling with proper implementation
- ⚠️ Video playback still uses native AVKit

**Implementation Details**:
```xml
<!-- TVML grid template -->
<grid>
  <section>
    <lockup>
      <img src="/api/thumbnail/{key}?size=medium" />
      <title>Photo 1</title>
    </lockup>
  </section>
</grid>
```

```javascript
// TVJS data fetching
async function loadMedia() {
  const response = await fetch('/api/media');
  const media = await response.json();
  // Render TVML template
}
```

**Pros**:
- More code sharing than native approach
- Faster iteration (no Xcode rebuilds)
- Familiar web technologies
- Apple provides templates for common patterns

**Cons**:
- TVML is a proprietary framework (only works on Apple TV)
- Less performant than native Swift
- Limited customization compared to native
- Fewer resources/documentation than SwiftUI
- Still requires Xcode for packaging
- Framework feels dated (last major update 2016)

**Effort**: Medium (2-4 weeks, learning curve for TVML)

---

### Option 3: Hybrid - WKWebView with Native Shell

**Description**: Wrap existing web UI in a native tvOS app using WKWebView

**Code Sharing**:
- ✅ Reuse 100% of existing web UI
- ✅ Reuse all JavaScript logic
- ✅ Reuse all CSS styling
- ⚠️ Add native wrapper for navigation
- **Estimated sharing**: ~95% (almost everything)

**Performance**:
- ❌ Poor - WKWebView on tvOS has limitations
- ❌ No smooth scrolling (inertia issues)
- ❌ Focus management is challenging
- ❌ No parallax effects
- ⚠️ Video playback works but without native feel

**Implementation Details**:
```swift
import WebKit

class ViewController: UIViewController {
    var webView: WKWebView!

    override func viewDidLoad() {
        super.viewDidLoad()
        webView = WKWebView(frame: view.bounds)
        webView.load(URLRequest(url: URL(string: "https://your-gallery.com")!))
        view.addSubview(webView)
    }

    // Handle remote control events
    override func pressesBegan(_ presses: Set<UIPress>, with event: UIPressesEvent?) {
        // Forward to webView or handle navigation
    }
}
```

**Pros**:
- Maximum code reuse (95%+)
- Fastest initial development
- Easy to maintain (one codebase)

**Cons**:
- **Poor performance** - WKWebView on tvOS is not optimized
- **No smooth scrolling** - CSS overflow scrolling doesn't work well
- Focus management requires extensive JavaScript/Swift bridging
- Doesn't feel native at all
- Limited access to tvOS features
- User experience will be subpar

**Effort**: Low (1 week) but **NOT RECOMMENDED** due to poor UX

---

### Option 4: React Native for tvOS

**Description**: Use React Native to build a cross-platform tvOS app

**Code Sharing**:
- ✅ Reuse all existing APIs
- ⚠️ Rewrite UI in React (if current web was React, would share more)
- ✅ Share business logic if extracted to shared modules
- **Estimated sharing**: ~40% (backend APIs, some logic if refactored)

**Performance**:
- ✅ Good (near-native with proper optimization)
- ✅ FlatList with focus management for smooth scrolling
- ✅ Native video player integration
- ⚠️ Requires careful optimization for performance

**Implementation Details**:
```jsx
import { FlatList, Image } from 'react-native';

const GalleryGrid = ({ media }) => {
  return (
    <FlatList
      data={media}
      numColumns={4}
      renderItem={({ item }) => (
        <Image
          source={{ uri: `/api/thumbnail/${item.key}?size=medium` }}
          style={{ width: 300, height: 300 }}
        />
      )}
    />
  );
};
```

**Pros**:
- Cross-platform potential (iOS, Android TV in future)
- Large community and ecosystem
- Hot reload for faster development
- Good performance with optimization
- Familiar for React developers

**Cons**:
- Your current web UI is vanilla JS, not React (no sharing)
- Additional dependency overhead
- tvOS support is community-maintained (not Meta official)
- Larger app bundle size than native
- Some tvOS features may require native modules

**Effort**: Medium-High (3-4 weeks, requires React knowledge)

---

## Recommendation Matrix

| Approach | Code Sharing | Performance | Smooth Scrolling | Native Feel | Effort | Overall Score |
|----------|-------------|-------------|------------------|-------------|--------|---------------|
| **Native tvOS** | 70% | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | Medium | **🏆 9/10** |
| TVML/TVJS | 50% | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | Medium | 7/10 |
| WKWebView Hybrid | 95% | ⭐⭐ | ⭐ | ⭐ | Low | ❌ 3/10 |
| React Native | 40% | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | High | 6/10 |

## Recommended Approach: Native tvOS with Swift/SwiftUI

**Rationale**:
1. **Best Performance**: Metal-accelerated rendering, native focus engine, UICollectionView prefetching
2. **Smooth Scrolling**: 60fps guaranteed with proper implementation
3. **Code Sharing**: All backend APIs remain unchanged (70% sharing)
4. **Future-Proof**: Full access to new tvOS features (SharePlay, Siri, etc.)
5. **10-Foot Experience**: Built specifically for TV viewing with focus management
6. **Reasonable Effort**: 2-3 weeks for MVP, clean architecture

### Implementation Plan

**Phase 1: Core Gallery (Week 1)**
- [ ] Create tvOS Xcode project
- [ ] Implement API client (reuse `/api/media` endpoint)
- [ ] Build grid layout with SwiftUI LazyVGrid
- [ ] Add AsyncImage with thumbnail loading
- [ ] Implement focus states and navigation

**Phase 2: Lightbox & Video (Week 2)**
- [ ] Full-screen image viewer with gestures
- [ ] Previous/Next navigation with remote control
- [ ] HLS video playback with AVKit
- [ ] Implement image caching (URLCache + NSCache)
- [ ] Add loading states and error handling

**Phase 3: Polish & Performance (Week 3)**
- [ ] Prefetch next images for instant navigation
- [ ] Add parallax effects on focus
- [ ] Top Shelf extension (show recent photos)
- [ ] Handle edge cases (empty state, network errors)
- [ ] Performance testing and optimization

### Code Architecture

```
AppleTVGallery/
├── App/
│   ├── AppleTVGalleryApp.swift          # App entry point
│   └── ContentView.swift                # Main container
├── Views/
│   ├── GalleryGrid.swift                # Photo grid
│   ├── MediaDetailView.swift            # Fullscreen viewer
│   └── Components/
│       ├── MediaThumbnail.swift         # Grid item
│       └── VideoPlayer.swift            # HLS player
├── Services/
│   ├── APIClient.swift                  # API networking
│   ├── ImageCache.swift                 # Image caching
│   └── MediaStore.swift                 # State management
├── Models/
│   └── MediaItem.swift                  # Data models
└── Resources/
    └── Assets.xcassets                  # App icons
```

### Key Features to Implement

1. **Grid Layout**
   - 4-5 columns in landscape
   - Lazy loading with prefetching
   - Focus-driven navigation

2. **Smooth Scrolling**
   - UICollectionView compositional layout
   - Prefetch next 20 items
   - Image downsampling for memory efficiency

3. **Video Playback**
   - Reuse existing HLS infrastructure
   - AVPlayerViewController for native controls
   - Seek preview thumbnails
   - Picture-in-Picture support

4. **Remote Control**
   - Arrow keys: Grid navigation
   - Select: Open fullscreen
   - Play/Pause: Video control
   - Menu: Back/Close
   - Swipe gestures: Next/Previous in lightbox

5. **Caching Strategy**
   - URLCache for HTTP caching (respect ETags)
   - NSCache for decoded images
   - Prefetch 10 items ahead and behind

### API Integration

**No backend changes required!** Reuse existing endpoints:

```swift
// Models matching your API
struct MediaItem: Codable {
    let key: String
    let filename: String
    let type: String // "image" | "video"
    let dateTaken: String?
    let thumbnailMedium: String?
    let width: Int?
    let height: Int?
    // ... other metadata
}

// API Client
class GalleryAPI {
    static let baseURL = "https://your-gallery.com"

    func fetchMedia() async throws -> [MediaItem] {
        let url = URL(string: "\(baseURL)/api/media")!
        let (data, _) = try await URLSession.shared.data(from: url)
        return try JSONDecoder().decode([MediaItem].self, from: data)
    }

    func thumbnailURL(key: String, size: String = "medium") -> URL {
        URL(string: "\(baseURL)/api/thumbnail/\(key)?size=\(size)")!
    }

    func hlsURL(key: String) -> URL {
        URL(string: "\(baseURL)/api/hls/\(key)/master.m3u8")!
    }
}
```

## Alternative Consideration: Progressive Enhancement

If you want to experiment first, you could:

1. **Start with TVML/TVJS** (2 weeks) - Test the concept with web tech
2. **Migrate to Native** (2 weeks) - If successful, rewrite in Swift for performance

This allows rapid prototyping while keeping the door open for native performance.

## Questions to Consider

1. **Distribution**: App Store or side-loading only?
2. **Authentication**: Will you reuse existing password protection?
3. **Offline Support**: Should photos cache locally on Apple TV?
4. **Target Audience**: Family/friends or public release?
5. **Timeline**: When do you want this ready?

## Next Steps

1. ✅ Discuss and decide on approach
2. Create new `appletv` directory in repo
3. Set up Xcode project (if going native)
4. Build API client and test with existing endpoints
5. Implement grid view prototype
6. Iterate on navigation and performance

---

**My Recommendation**: Go with **Native tvOS (Swift/SwiftUI)** for the best user experience and long-term maintainability. The investment in learning Swift (if needed) will pay off in performance, and you'll still reuse 70% of your infrastructure (all APIs, video streaming, thumbnails).

Let me know which approach you'd like to pursue, and I can help with the implementation!
