import type { Meta, StoryObj } from "@storybook/react";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "./card";
import { Button } from "./button";

const meta = {
  title: "UI/Card",
  component: Card,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
} satisfies Meta<typeof Card>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <Card className="w-[350px]">
      <CardHeader>
        <CardTitle>Card Title</CardTitle>
        <CardDescription>Card Description</CardDescription>
      </CardHeader>
      <CardContent>
        <p>Card Content</p>
      </CardContent>
      <CardFooter>
        <Button>Action</Button>
      </CardFooter>
    </Card>
  ),
};

export const Simple: Story = {
  render: () => (
    <Card className="w-[350px]">
      <CardHeader>
        <CardTitle>Simple Card</CardTitle>
      </CardHeader>
      <CardContent>
        <p>This is a simple card with just a title and content.</p>
      </CardContent>
    </Card>
  ),
};

export const WithFooter: Story = {
  render: () => (
    <Card className="w-[350px]">
      <CardHeader>
        <CardTitle>Notifications</CardTitle>
        <CardDescription>You have 3 unread messages.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          <p className="text-sm">Message 1</p>
          <p className="text-sm">Message 2</p>
          <p className="text-sm">Message 3</p>
        </div>
      </CardContent>
      <CardFooter className="gap-2">
        <Button variant="outline">Dismiss</Button>
        <Button>Mark as Read</Button>
      </CardFooter>
    </Card>
  ),
};

export const Gallery: Story = {
  render: () => (
    <div className="grid grid-cols-2 gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Photo 1</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-40 bg-muted rounded flex items-center justify-center">
            Image placeholder
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Photo 2</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-40 bg-muted rounded flex items-center justify-center">
            Image placeholder
          </div>
        </CardContent>
      </Card>
    </div>
  ),
};
