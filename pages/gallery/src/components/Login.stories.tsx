import type { Meta, StoryObj } from "@storybook/react";
import { Login } from "./Login";

const meta = {
  title: "Components/Login",
  component: Login,
  parameters: {
    layout: "fullscreen",
  },
  tags: ["autodocs"],
} satisfies Meta<typeof Login>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithMockError: Story = {
  render: () => {
    // Mock component with error state pre-set
    const LoginWithError = () => {
      return (
        <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-purple-600 to-purple-900 px-4">
          <div className="w-full max-w-md rounded-xl bg-white p-8 shadow-2xl">
            <div className="mb-8 text-center">
              <img
                src="https://assets.shirhatti.com/weddinglogo.svg"
                alt="Wedding Logo"
                className="mx-auto h-16 w-auto"
              />
            </div>

            <h1 className="mb-2 text-center text-2xl font-bold text-zinc-900">
              Welcome
            </h1>
            <p className="mb-8 text-center text-zinc-600">
              Enter the password to view the gallery
            </p>

            <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-center text-sm text-red-700">
              Invalid password. Please try again.
            </div>

            <form>
              <input
                type="password"
                placeholder="Enter password"
                className="mb-4 w-full rounded-md border-2 border-zinc-200 px-4 py-3 text-base transition-colors focus:border-purple-600 focus:outline-none"
              />
              <button
                type="button"
                className="w-full rounded-md bg-gradient-to-r from-purple-600 to-purple-900 py-6 text-base font-semibold text-white hover:opacity-90"
              >
                Access Gallery
              </button>
            </form>
          </div>
        </div>
      );
    };
    return <LoginWithError />;
  },
};
