import type { Meta, StoryObj } from "@storybook/react";
import { Lightbox } from "./Lightbox";
import { MediaItem } from "@/types";

// Mock media items for stories
const mockMediaItems: MediaItem[] = [
  {
    key: "photos/image1.jpg",
    name: "Beautiful Landscape",
    type: "image",
    width: 1920,
    height: 1080,
    urls: {
      original: "https://picsum.photos/1920/1080?random=1",
      thumbnailSmall: "https://picsum.photos/150/150?random=1",
      thumbnailMedium: "https://picsum.photos/400/400?random=1",
      thumbnailLarge: "https://picsum.photos/800/800?random=1",
    },
  },
  {
    key: "photos/image2.jpg",
    name: "City Skyline",
    type: "image",
    width: 1920,
    height: 1280,
    urls: {
      original: "https://picsum.photos/1920/1280?random=2",
      thumbnailSmall: "https://picsum.photos/150/150?random=2",
      thumbnailMedium: "https://picsum.photos/400/400?random=2",
      thumbnailLarge: "https://picsum.photos/800/800?random=2",
    },
  },
  {
    key: "photos/image3.jpg",
    name: "Mountain View",
    type: "image",
    width: 2400,
    height: 1600,
    urls: {
      original: "https://picsum.photos/2400/1600?random=3",
      thumbnailSmall: "https://picsum.photos/150/150?random=3",
      thumbnailMedium: "https://picsum.photos/400/400?random=3",
      thumbnailLarge: "https://picsum.photos/800/800?random=3",
    },
  },
];

const meta = {
  title: "Components/Lightbox",
  component: Lightbox,
  parameters: {
    layout: "fullscreen",
  },
  tags: ["autodocs"],
  argTypes: {
    onClose: { action: "closed" },
  },
} satisfies Meta<typeof Lightbox>;

export default meta;
type Story = StoryObj<typeof meta>;

export const FirstImage: Story = {
  args: {
    media: mockMediaItems,
    initialIndex: 0,
    onClose: () => console.log("Close lightbox"),
  },
};

export const SecondImage: Story = {
  args: {
    media: mockMediaItems,
    initialIndex: 1,
    onClose: () => console.log("Close lightbox"),
  },
};

export const SingleImage: Story = {
  args: {
    media: [mockMediaItems[0]],
    initialIndex: 0,
    onClose: () => console.log("Close lightbox"),
  },
};

export const PortraitImage: Story = {
  args: {
    media: [
      {
        key: "photos/portrait.jpg",
        name: "Portrait Photo",
        type: "image",
        width: 1080,
        height: 1920,
        urls: {
          original: "https://picsum.photos/1080/1920?random=10",
          thumbnailSmall: "https://picsum.photos/150/150?random=10",
          thumbnailMedium: "https://picsum.photos/400/400?random=10",
          thumbnailLarge: "https://picsum.photos/800/800?random=10",
        },
      },
    ],
    initialIndex: 0,
    onClose: () => console.log("Close lightbox"),
  },
};
