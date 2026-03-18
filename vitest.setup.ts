import "@testing-library/jest-dom";

// Polyfill ResizeObserver for jsdom (used by timeline and audit-log-table)
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// Polyfill scrollBy for jsdom (used by audit-log-table scroll buttons)
if (!HTMLElement.prototype.scrollBy) {
  HTMLElement.prototype.scrollBy = function () {};
}
