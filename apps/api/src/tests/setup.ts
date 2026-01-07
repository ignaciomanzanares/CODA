/**
 * Test setup file
 * Runs before all tests
 */

// Set test environment variables
process.env.NODE_ENV = "test";
process.env.USE_MEM_STORAGE = "1"; // Force in-memory storage for tests
process.env.AUTH0_ISSUER_BASE_URL = "https://test.auth0.com/";
process.env.AUTH0_AUDIENCE = "https://test-api";
process.env.VITE_AUTH0_DOMAIN = "test.auth0.com";
process.env.VITE_AUTH0_CLIENT_ID = "test-client-id";
process.env.VITE_AUTH0_AUDIENCE = "https://test-api";
process.env.VITE_AUTH0_REDIRECT_URI = "http://localhost:5173";

console.log("🧪 Test environment configured");
