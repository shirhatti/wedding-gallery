import type { Meta, StoryObj } from "@storybook/react";
import { LazyImage } from "./LazyImage";

const meta = {
  title: "Components/LazyImage",
  component: LazyImage,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
} satisfies Meta<typeof LazyImage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    src: "https://picsum.photos/400/300",
    alt: "Sample image",
    aspectRatio: 4 / 3,
  },
};

export const WithSrcset: Story = {
  args: {
    src: "https://picsum.photos/400/300",
    srcset: "https://picsum.photos/200/150 200w, https://picsum.photos/400/300 400w, https://picsum.photos/800/600 800w",
    sizes: "(max-width: 640px) 100vw, 50vw",
    alt: "Responsive image",
    aspectRatio: 4 / 3,
  },
};

export const Portrait: Story = {
  args: {
    src: "https://picsum.photos/300/400",
    alt: "Portrait image",
    aspectRatio: 3 / 4,
  },
};

export const Landscape: Story = {
  args: {
    src: "https://picsum.photos/600/400",
    alt: "Landscape image",
    aspectRatio: 3 / 2,
  },
};

export const Square: Story = {
  args: {
    src: "https://picsum.photos/400/400",
    alt: "Square image",
    aspectRatio: 1,
  },
};

export const NoAspectRatio: Story = {
  args: {
    src: "https://picsum.photos/400/300",
    alt: "Image without aspect ratio",
  },
};

export const CustomClassName: Story = {
  args: {
    src: "https://picsum.photos/400/300",
    alt: "Image with custom styling",
    aspectRatio: 4 / 3,
    className: "rounded-lg shadow-xl",
  },
};

export const ImageGrid: Story = {
  render: () => (
    <div className="grid grid-cols-3 gap-4 w-[600px]">
      {[1, 2, 3, 4, 5, 6].map((i) => (
        <LazyImage
          key={i}
          src={`https://picsum.photos/200/200?random=${i}`}
          alt={`Grid image ${i}`}
          aspectRatio={1}
          className="rounded"
        />
      ))}
    </div>
  ),
};
