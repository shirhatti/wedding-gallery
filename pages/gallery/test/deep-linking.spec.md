# Deep Linking Integration Tests

## Test Scenarios

### 1. Deep Link Redirects

**Test: /video/:key → /videos?lightbox=:key**
```
Given: A user navigates to /video/1234567890-example.mp4
When: The DeepLink component mounts
Then: The user should be redirected to /videos?lightbox=1234567890-example.mp4
And: The lightbox should open automatically with the video
```

**Test: /image/:key → /images?lightbox=:key**
```
Given: A user navigates to /image/1234567890-example.jpg
When: The DeepLink component mounts
Then: The user should be redirected to /images?lightbox=1234567890-example.jpg
And: The lightbox should open automatically with the image
```

**Test: Public video deep link**
```
Given: A user navigates to /video/public/1234567890-example.mp4
When: The DeepLink component mounts
Then: The user should be redirected to /videos?lightbox=public/1234567890-example.mp4
And: The public gallery should load (no auth required)
And: The lightbox should open with the public video
```

**Test: Private video deep link**
```
Given: A user navigates to /video/1234567890-private.mp4 (no public/ prefix)
When: The DeepLink component mounts
Then: The user should be redirected to /private/videos?lightbox=1234567890-private.mp4
And: Auth should be required (if not authenticated, redirect to login)
And: The lightbox should open with the private video
```

### 2. Public Scope Filtering

**Test: Public gallery only shows public items**
```
Given: The database contains both public/ and private items
When: A user navigates to /videos (public scope)
Then: Only items with keys starting with "public/" should be displayed
And: Private items should not be visible
```

**Test: Private gallery requires authentication**
```
Given: A user is not authenticated
When: The user navigates to /private/videos
Then: The user should be redirected to /login
And: After login, should return to /private/videos
```

**Test: Private gallery shows all items when authenticated**
```
Given: A user is authenticated
When: The user navigates to /private/videos
Then: All items (public/ and private) should be displayed
```

### 3. Lightbox Query Param Handling

**Test: Lightbox opens from query param**
```
Given: The gallery has loaded with media
When: The URL contains ?lightbox=1234567890-example.mp4
Then: The lightbox should open automatically
And: The correct media item should be displayed
```

**Test: Lightbox updates URL on navigation**
```
Given: The lightbox is open with item A
When: The user clicks next/previous arrows
Then: The URL query param should update to the new item's key
And: The browser history should be updated (replaceState, not pushState)
```

**Test: Lightbox removes query param on close**
```
Given: The lightbox is open with ?lightbox=key in URL
When: The user closes the lightbox
Then: The lightbox query param should be removed from URL
And: The user should see the gallery grid
```

**Test: Invalid lightbox key in query param**
```
Given: The URL contains ?lightbox=nonexistent-key
When: The gallery loads
Then: The lightbox should not open
And: No error should be shown
And: The gallery grid should display normally
```

**Test: Lightbox key not yet loaded**
```
Given: The URL contains ?lightbox=valid-key
When: The gallery is still loading media
Then: The lightbox should not open yet
When: The media finishes loading
Then: The lightbox should open with the correct item
```

### 4. Edge Cases

**Test: Deep link with URL-encoded characters**
```
Given: A filename contains spaces or special characters
When: The deep link is /video/1234567890-My%20Video.mp4
Then: The key should be properly decoded
And: The lightbox should open with the correct video
```

**Test: Deep link to filtered view**
```
Given: User navigates to /video/key from external source
When: DeepLink redirects to /videos?lightbox=key
Then: Only videos should be shown in the gallery
And: The lightbox should open with the video
```

**Test: Shareable URLs maintain state**
```
Given: User opens lightbox and copies URL
When: Another user pastes URL in new browser
Then: The same gallery view and lightbox state should be restored
And: Deep link functionality should work consistently
```

## Implementation Notes

To implement these tests, we need:

1. **React Testing Library** - For component testing
2. **Mock Router** - To test React Router navigation
3. **Mock API** - To simulate media fetch responses
4. **Testing Library User Event** - For interaction testing

Dependencies to add:
```json
{
  "devDependencies": {
    "@testing-library/react": "^14.0.0",
    "@testing-library/jest-dom": "^6.1.5",
    "@testing-library/user-event": "^14.5.1",
    "jsdom": "^23.0.1",
    "vitest": "^1.0.0"
  }
}
```

Test file structure:
```
pages/gallery/test/
  ├── deep-linking.spec.ts      # Deep link redirect tests
  ├── gallery.spec.ts           # Gallery component tests
  ├── lightbox.spec.ts          # Lightbox query param tests
  └── setup.ts                  # Test setup and mocks
```
