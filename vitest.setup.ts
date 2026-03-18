import "@testing-library/jest-dom";

// Polyfill ResizeObserver for jsdom (used by timeline and audit-log-table)
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};
