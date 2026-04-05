import { render, RenderOptions } from "@testing-library/react";
import { ReactElement } from "react";
import { MockedFunction } from "vitest";

// Types for test data
interface MockProperty {
  id: string;
  name: string;
  unitCount: number;
  archivedAt: string | null;
}

// Mock API responses
export const mockProperty: MockProperty = {
  id: "prop-1",
  name: "Test Property",
  unitCount: 2,
  archivedAt: null,
};

export const mockArchivedProperty: MockProperty = {
  ...mockProperty,
  archivedAt: "2026-04-01T00:00:00Z",
};

// API fetch mock utilities
export const mockApiResponse = (response: unknown, status = 200) => {
  const mockFetch = global.fetch as MockedFunction<typeof fetch>;
  mockFetch.mockResolvedValueOnce({
    ok: status >= 200 && status < 300,
    status,
    json: async () => response,
  } as Response);
};

export const mockApiError = (status = 400, error = "Test error") => {
  const mockFetch = global.fetch as MockedFunction<typeof fetch>;
  mockFetch.mockResolvedValueOnce({
    ok: false,
    status,
    json: async () => ({ error, message: error }),
  } as Response);
};

// Custom render with common providers
type CustomRenderOptions = Omit<RenderOptions, "wrapper">;

export const renderWithProviders = (
  ui: ReactElement,
  options?: CustomRenderOptions
) => {
  const { ...renderOptions } = options || {};
  
  return render(ui, renderOptions);
};

// Re-export testing library utilities  
export * from "@testing-library/react";
export { userEvent } from "@testing-library/user-event";