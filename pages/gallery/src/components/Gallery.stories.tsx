import type { Meta, StoryObj } from "@storybook/react";
import { Gallery } from "./Gallery";
import { MediaItem } from "@/types";

// Mock media items for stories
const mockMediaItems: MediaItem[] = Array.from({ length: 20 }, (_, i) => ({
  key: `photos/image${i + 1}.jpg`,
  name: `Photo ${i + 1}`,
  type: i % 8 === 0 ? "video" : "image",
  width: 1920,
  height: Math.random() > 0.5 ? 1080 : 1280,
  urls: {
    original: `https://picsum.photos/1920/${Math.random() > 0.5 ? 1080 : 1280}?random=${i + 1}`,
    thumbnailSmall: `https://picsum.photos/150/150?random=${i + 1}`,
    thumbnailMedium: `https://picsum.photos/400/400?random=${i + 1}`,
    thumbnailLarge: `https://picsum.photos/800/800?random=${i + 1}`,
  },
}));

const meta = {
  title: "Components/Gallery",
  component: Gallery,
  parameters: {
    layout: "fullscreen",
    mockData: [
      {
        url: "/api/media",
        method: "GET",
        status: 200,
        response: {
          media: mockMediaItems,
        },
      },
    ],
  },
  tags: ["autodocs"],
} satisfies Meta<typeof Gallery>;

export default meta;
type Story = StoryObj<typeof meta>;

export const LoadingState: Story = {
  render: () => (
    <div className="flex h-screen items-center justify-center bg-zinc-900">
      <div className="h-12 w-12 animate-spin rounded-full border-4 border-zinc-700 border-t-white" />
    </div>
  ),
};

export const EmptyState: Story = {
  render: () => (
    <div className="flex h-screen items-center justify-center bg-zinc-900">
      <p className="text-xl text-zinc-400">No media found</p>
    </div>
  ),
};

export const ErrorState: Story = {
  render: () => (
    <div className="flex h-screen items-center justify-center bg-zinc-900">
      <div className="text-center">
        <p className="text-xl text-red-400">Failed to load media</p>
        <button className="mt-4 rounded-md bg-white px-4 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-100">
          Retry
        </button>
      </div>
    </div>
  ),
};

export const WithMockData: Story = {
  render: () => {
    // Simplified gallery view for Storybook
    return (
      <div className="min-h-screen bg-zinc-900 pb-8 pt-4">
        <div className="mb-4 border-b border-zinc-800 bg-black px-4 py-4 text-center">
          <img
            src="https://assets.shirhatti.com/weddinglogo.svg"
            alt="Wedding Logo"
            className="mx-auto h-10 w-auto"
          />
        </div>
        <div className="mx-auto max-w-[1600px] px-2">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {mockMediaItems.slice(0, 12).map((item, index) => (
              <div
                key={item.key}
                className="group relative overflow-hidden rounded-lg shadow-lg transition-all duration-300 hover:shadow-2xl hover:-translate-y-1"
              >
                <img
                  src={item.urls?.thumbnailMedium}
                  alt={item.name}
                  className="w-full h-auto"
                />
                {item.type === "video" && (
                  <div className="absolute right-3 top-3 rounded-full bg-black/80 px-3 py-1.5 text-xs font-medium text-white backdrop-blur-sm">
                    Video
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  },
};
