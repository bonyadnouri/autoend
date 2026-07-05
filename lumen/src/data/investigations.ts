import type { TestInvestigation } from "../types";

const baseEnvironment = {
  device: "iPhone 15 Pro (Simulator)",
  os: "iOS 18.2",
  appVersion: "ShopFlow 3.4.1 (build 2261)",
  orientation: "Portrait",
  theme: "Light",
  network: "Wi-Fi (throttled: Fast 3G)",
  timestamp: "2026-07-04T14:11:42Z",
};

export const investigations: Record<string, TestInvestigation> = {
  "T-003": {
    testId: "T-003",
    recordedReason: "Failure",
    analysis: {
      rootCause:
        "The 'Forgot password' link is not wired to a route or handler, so clicking it does nothing.",
      explanation:
        "The click event fired, but navigation to '/reset-password' was aborted because the route is not registered. No reset request ever reached the backend, so this is a frontend routing defect rather than an API failure. The user stayed on the Login screen with no visible feedback.",
      confidence: 88,
      faultDomain: "frontend",
      nextSteps: [
        "Register the '/reset-password' route and point the link to it.",
        "Wire the link to trigger POST /api/auth/reset-request on submit.",
        "Add a visible confirmation state after the reset email is sent.",
      ],
    },
    replay: {
      durationMs: 5600,
      videoUrl: null,
      frames: [
        { tMs: 0, screenId: "login", caption: "Login screen loaded" },
        { tMs: 1500, screenId: "login", caption: "Account email entered", marker: "action" },
        { tMs: 3000, screenId: "login", caption: "'Forgot password' clicked", marker: "action" },
        { tMs: 4200, screenId: "login", caption: "Screen unchanged - still on Login" },
        { tMs: 5000, screenId: "login", caption: "Failure: reset screen never opened", marker: "failure" },
      ],
    },
    evidence: [
      { label: "Before action", screenId: "login", tMs: 2800, caption: "Login screen before clicking the link" },
      { label: "After action", screenId: "login", tMs: 3200, caption: "Screen unchanged immediately after click" },
      { label: "At failure", screenId: "login", tMs: 5000, caption: "Assertion failed - still on Login" },
    ],
    network: [
      { id: "n1", method: "GET", endpoint: "/api/session", status: 200, durationMs: 118, failed: false, tMs: 200, responsePayload: '{ "authenticated": false }' },
      { id: "n2", method: "GET", endpoint: "/assets/login.chunk.js", status: 200, durationMs: 42, failed: false, tMs: 320 },
    ],
    logs: [
      { id: "l1", level: "info", source: "application", tMs: 0, message: "Test session started: T-003 (Recover access via forgot password)" },
      { id: "l2", level: "info", source: "console", tMs: 3000, message: "click: a.forgot-password" },
      {
        id: "l3",
        level: "error",
        source: "console",
        tMs: 3010,
        message: "Navigation aborted: route '/reset-password' is not registered",
        stack: "at Router.navigate (router.js:112)\n  at HTMLAnchorElement.onClick (Login.tsx:48)\n  at HTMLAnchorElement.dispatchEvent (dom.js:21)",
      },
      { id: "l4", level: "warn", source: "application", tMs: 5000, message: "Assertion failed: expected active screen 'reset-password' but got 'login'" },
    ],
    timeline: [
      { tMs: 0, screenId: "login", label: "Open Login screen", kind: "navigate" },
      { tMs: 1500, screenId: "login", label: "Enter account email", kind: "action" },
      { tMs: 3000, screenId: "login", label: "Click 'Forgot password'", kind: "action" },
      { tMs: 4200, screenId: "login", label: "Expect password reset screen", kind: "assertion" },
      { tMs: 5000, screenId: "login", label: "No navigation occurred", kind: "failure" },
    ],
    comparison: [
      { aspect: "Active screen", expected: "Password reset screen", actual: "Login (unchanged)" },
      { aspect: "Network request", expected: "POST /api/auth/reset-request", actual: "No request sent" },
      { aspect: "User feedback", expected: "Reset email confirmation", actual: "No visible response" },
    ],
    environment: { ...baseEnvironment },
  },

  "T-005": {
    testId: "T-005",
    recordedReason: "Failure",
    analysis: {
      rootCause: "The category filter endpoint returns an empty result set for valid categories.",
      explanation:
        "GET /api/products?category=accessories returned HTTP 200 with an empty array, while the unfiltered catalog returns 128 products. The frontend rendered correctly given the (empty) response, so the defect is in the backend or data layer - not the UI.",
      confidence: 82,
      faultDomain: "backend",
      nextSteps: [
        "Verify the category mapping for 'accessories' in the products service.",
        "Check whether products are tagged with the expected category slug.",
        "Add an integration test asserting non-empty results for known categories.",
      ],
    },
    replay: {
      durationMs: 5200,
      videoUrl: null,
      frames: [
        { tMs: 0, screenId: "home", caption: "Home screen" },
        { tMs: 1200, screenId: "products", caption: "Product catalog loaded (128 items)" },
        { tMs: 2600, screenId: "products", caption: "Category filter opened", marker: "action" },
        { tMs: 3400, screenId: "products", caption: "'Accessories' selected", marker: "action" },
        { tMs: 4800, screenId: "products", caption: "Failure: empty product grid", marker: "failure" },
      ],
    },
    evidence: [
      { label: "Before action", screenId: "products", tMs: 2400, caption: "Full catalog before filtering" },
      { label: "After action", screenId: "products", tMs: 3600, caption: "Grid after selecting Accessories" },
      { label: "At failure", screenId: "products", tMs: 4800, caption: "Empty grid - no products rendered" },
    ],
    network: [
      { id: "n1", method: "GET", endpoint: "/api/products", status: 200, durationMs: 214, failed: false, tMs: 1300, responsePayload: '{ "total": 128, "items": [ /* 128 products */ ] }' },
      {
        id: "n2",
        method: "GET",
        endpoint: "/api/products?category=accessories",
        status: 200,
        durationMs: 176,
        failed: false,
        tMs: 3500,
        requestPayload: "category=accessories",
        responsePayload: '{ "total": 0, "items": [] }',
      },
    ],
    logs: [
      { id: "l1", level: "info", source: "application", tMs: 0, message: "Test session started: T-005 (Filter products by category)" },
      { id: "l2", level: "info", source: "console", tMs: 3400, message: "filter change: category=accessories" },
      { id: "l3", level: "warn", source: "application", tMs: 3700, message: "Rendered 0 of 128 products after applying filter 'accessories'" },
      { id: "l4", level: "warn", source: "application", tMs: 4800, message: "Assertion failed: expected >0 products in grid, found 0" },
    ],
    timeline: [
      { tMs: 0, screenId: "home", label: "Open Home", kind: "navigate" },
      { tMs: 1200, screenId: "products", label: "Open product catalog", kind: "navigate" },
      { tMs: 2600, screenId: "products", label: "Open category filter", kind: "action" },
      { tMs: 3400, screenId: "products", label: "Select 'Accessories'", kind: "action" },
      { tMs: 4200, screenId: "products", label: "Expect accessories in grid", kind: "assertion" },
      { tMs: 4800, screenId: "products", label: "Grid rendered empty", kind: "failure" },
    ],
    comparison: [
      { aspect: "Products shown", expected: "Accessories subset", actual: "0 products" },
      { aspect: "API response", expected: "Non-empty accessories list", actual: "200 OK with empty array []" },
      { aspect: "Fault domain", expected: "-", actual: "Backend / data (UI rendered valid empty state)" },
    ],
    environment: { ...baseEnvironment, network: "Wi-Fi" },
  },

  "T-008": {
    testId: "T-008",
    recordedReason: "Failure",
    analysis: {
      rootCause: "The cart line item does not render any remove or delete control.",
      explanation:
        "The cart loaded correctly with one line item, but no remove control exists in the DOM. The test could not perform the removal because the affordance is missing. No DELETE request was possible, confirming a frontend gap rather than an API error.",
      confidence: 91,
      faultDomain: "frontend",
      nextSteps: [
        "Add a remove/delete action to each cart line item.",
        "Wire it to DELETE /api/cart/items/:id and recalculate totals.",
        "Expose a stable test id (e.g. data-testid=remove-item).",
      ],
    },
    replay: {
      durationMs: 4800,
      videoUrl: null,
      frames: [
        { tMs: 0, screenId: "product-detail", caption: "Product detail screen" },
        { tMs: 1400, screenId: "product-detail", caption: "Item added to cart", marker: "action" },
        { tMs: 2600, screenId: "cart", caption: "Cart opened with 1 item" },
        { tMs: 3600, screenId: "cart", caption: "Searching for remove control", marker: "action" },
        { tMs: 4400, screenId: "cart", caption: "Failure: no remove control found", marker: "failure" },
      ],
    },
    evidence: [
      { label: "Before action", screenId: "cart", tMs: 2800, caption: "Cart with one line item" },
      { label: "After action", screenId: "cart", tMs: 3600, caption: "Line item inspected - no remove control" },
      { label: "At failure", screenId: "cart", tMs: 4400, caption: "Removal not possible" },
    ],
    network: [
      { id: "n1", method: "POST", endpoint: "/api/cart/items", status: 200, durationMs: 162, failed: false, tMs: 1500, requestPayload: '{ "productId": "sku-4471", "qty": 2 }', responsePayload: '{ "cartId": "c-88", "items": 1 }' },
      { id: "n2", method: "GET", endpoint: "/api/cart", status: 200, durationMs: 88, failed: false, tMs: 2700, responsePayload: '{ "items": [ { "id": "li-1", "productId": "sku-4471", "qty": 2 } ] }' },
    ],
    logs: [
      { id: "l1", level: "info", source: "application", tMs: 0, message: "Test session started: T-008 (Remove an item from the cart)" },
      { id: "l2", level: "info", source: "console", tMs: 3600, message: "querySelector('[data-testid=remove-item]') -> null" },
      {
        id: "l3",
        level: "error",
        source: "console",
        tMs: 3610,
        message: "No removable control found within cart line item",
        stack: "at findRemoveControl (Cart.spec.ts:64)\n  at step 'remove item' (runner.ts:210)",
      },
      { id: "l4", level: "warn", source: "application", tMs: 4400, message: "Assertion failed: expected a remove control to be present" },
    ],
    timeline: [
      { tMs: 0, screenId: "product-detail", label: "Open product detail", kind: "navigate" },
      { tMs: 1400, screenId: "product-detail", label: "Add item to cart", kind: "action" },
      { tMs: 2600, screenId: "cart", label: "Open cart", kind: "navigate" },
      { tMs: 3600, screenId: "cart", label: "Look for remove control", kind: "action" },
      { tMs: 4400, screenId: "cart", label: "No remove control present", kind: "failure" },
    ],
    comparison: [
      { aspect: "Remove control", expected: "Visible per line item", actual: "Not present in DOM" },
      { aspect: "Cart after remove", expected: "Item removed, total recalculated", actual: "Action impossible" },
      { aspect: "Network request", expected: "DELETE /api/cart/items/li-1", actual: "No request sent" },
    ],
    environment: { ...baseEnvironment },
  },

  "T-012": {
    testId: "T-012",
    recordedReason: "Failure",
    analysis: {
      rootCause: "The backend accepts weak passwords; strength validation is missing server-side.",
      explanation:
        "PUT /api/account/password returned HTTP 200 for the password '123'. The frontend submitted the form correctly and no validation error was returned, so the missing password-strength check is a backend defect. The account password was actually changed to an insecure value.",
      confidence: 84,
      faultDomain: "backend",
      nextSteps: [
        "Enforce password strength rules in the account service and return 422 on failure.",
        "Surface the validation error inline on the Settings form.",
        "Add a security test asserting weak passwords are rejected.",
      ],
    },
    replay: {
      durationMs: 5000,
      videoUrl: null,
      frames: [
        { tMs: 0, screenId: "profile", caption: "Profile screen" },
        { tMs: 1200, screenId: "settings", caption: "Settings screen opened" },
        { tMs: 2400, screenId: "settings", caption: "Weak password '123' entered", marker: "action" },
        { tMs: 3200, screenId: "settings", caption: "Change password submitted", marker: "action" },
        { tMs: 4600, screenId: "settings", caption: "Failure: weak password accepted", marker: "failure" },
      ],
    },
    evidence: [
      { label: "Before action", screenId: "settings", tMs: 2200, caption: "Change password form with weak input" },
      { label: "After action", screenId: "settings", tMs: 3400, caption: "Form submitted, no error shown" },
      { label: "At failure", screenId: "settings", tMs: 4600, caption: "Success state - password changed" },
    ],
    network: [
      {
        id: "n1",
        method: "PUT",
        endpoint: "/api/account/password",
        status: 200,
        durationMs: 238,
        failed: false,
        tMs: 3300,
        requestPayload: '{ "password": "123" }',
        responsePayload: '{ "status": "updated" }',
      },
    ],
    logs: [
      { id: "l1", level: "info", source: "application", tMs: 0, message: "Test session started: T-012 (Change the account password)" },
      { id: "l2", level: "info", source: "console", tMs: 3200, message: "submit: change-password form" },
      { id: "l3", level: "info", source: "application", tMs: 3600, message: "Password updated for user #4821" },
      { id: "l4", level: "warn", source: "application", tMs: 4600, message: "Assertion failed: expected HTTP 422 (validation), received 200" },
    ],
    timeline: [
      { tMs: 0, screenId: "profile", label: "Open Profile", kind: "navigate" },
      { tMs: 1200, screenId: "settings", label: "Open Settings", kind: "navigate" },
      { tMs: 2400, screenId: "settings", label: "Enter weak password '123'", kind: "action" },
      { tMs: 3200, screenId: "settings", label: "Submit change password", kind: "action" },
      { tMs: 4000, screenId: "settings", label: "Expect validation error (422)", kind: "assertion" },
      { tMs: 4600, screenId: "settings", label: "Password accepted (200)", kind: "failure" },
    ],
    comparison: [
      { aspect: "HTTP status", expected: "422 Unprocessable Entity", actual: "200 OK" },
      { aspect: "Validation", expected: "Weak password rejected", actual: "Accepted and saved" },
      { aspect: "Account state", expected: "Password unchanged", actual: "Password set to '123'" },
    ],
    environment: { ...baseEnvironment, theme: "Dark", orientation: "Portrait" },
  },

  "T-009": {
    testId: "T-009",
    recordedReason: "Critical journey (Checkout)",
    replay: {
      durationMs: 6500,
      videoUrl: null,
      frames: [
        { tMs: 0, screenId: "checkout", caption: "Checkout screen" },
        { tMs: 1500, screenId: "checkout", caption: "Shipping details entered", marker: "action" },
        { tMs: 3000, screenId: "checkout", caption: "Card details entered", marker: "action" },
        { tMs: 4500, screenId: "checkout", caption: "'Place order' clicked", marker: "action" },
        { tMs: 6000, screenId: "confirmation", caption: "Order confirmation shown" },
      ],
    },
    evidence: [
      { label: "Before action", screenId: "checkout", tMs: 4400, caption: "Checkout before placing order" },
      { label: "After action", screenId: "confirmation", tMs: 6000, caption: "Order confirmation" },
    ],
    network: [
      { id: "n1", method: "POST", endpoint: "/api/orders", status: 201, durationMs: 318, failed: false, tMs: 4600, requestPayload: '{ "cartId": "c-88", "payment": "tok_visa" }', responsePayload: '{ "orderId": "9f3a", "status": "confirmed" }' },
      { id: "n2", method: "GET", endpoint: "/api/orders/9f3a", status: 200, durationMs: 92, failed: false, tMs: 6000, responsePayload: '{ "orderId": "9f3a", "total": 128.40 }' },
    ],
    logs: [
      { id: "l1", level: "info", source: "application", tMs: 0, message: "Test session started: T-009 (Complete checkout with valid payment)" },
      { id: "l2", level: "info", source: "console", tMs: 4500, message: "click: button.place-order" },
      { id: "l3", level: "info", source: "application", tMs: 6000, message: "Order 9f3a confirmed" },
    ],
    timeline: [
      { tMs: 0, screenId: "checkout", label: "Open Checkout", kind: "navigate" },
      { tMs: 1500, screenId: "checkout", label: "Enter shipping details", kind: "action" },
      { tMs: 3000, screenId: "checkout", label: "Enter card details", kind: "action" },
      { tMs: 4500, screenId: "checkout", label: "Click 'Place order'", kind: "action" },
      { tMs: 6000, screenId: "confirmation", label: "Order confirmation shown", kind: "assertion" },
    ],
    comparison: [],
    environment: { ...baseEnvironment, network: "Wi-Fi" },
  },
};

export function getInvestigation(testId: string): TestInvestigation | undefined {
  return investigations[testId];
}
