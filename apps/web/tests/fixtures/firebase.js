// Test-only session fixture. apiFetch still verifies a user and requests a token;
// the browser regression harness never initializes or connects to real Firebase.
export const auth = { currentUser: null };
