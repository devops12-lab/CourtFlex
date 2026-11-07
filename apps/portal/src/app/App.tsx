import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "react-router";
import { ToastProvider } from "@courtflex/ui";
import { ApiError } from "@courtflex/api";
import { router } from "./router";
import { MockControls } from "@courtflex/features";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (count, error) =>
        !(error instanceof ApiError && error.status < 500 && error.status > 0) && count < 2,
    },
  },
});

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <RouterProvider router={router} />
        <MockControls />
      </ToastProvider>
    </QueryClientProvider>
  );
}
