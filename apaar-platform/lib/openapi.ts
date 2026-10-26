/** The public API, described for developers. Served as JSON at /api/docs. */
export function openApiDocument(baseUrl = "") {
  const claim = {
    type: "object",
    properties: { key: { type: "string" }, label: { type: "string" }, value: { type: "boolean" } },
    required: ["key", "label", "value"],
  };
  const item = {
    type: "object",
    description: "Provide a Smart QR payload or an APAAR ID. An APAAR ID is hashed on arrival and never returned.",
    properties: {
      qr: { type: "string", description: "A Smart QR payload beginning APAARQR1.", maxLength: 4096 },
      apaarId: { type: "string", maxLength: 40 },
    },
  };
  const result = {
    type: "object",
    properties: {
      index: { type: "integer" },
      status: { type: "string", enum: ["AUTHENTIC", "REVOKED", "SUPERSEDED", "EXPIRED", "INVALID_SIGNATURE", "NOT_FOUND", "ERROR"] },
      headline: { type: "string" },
      detail: { type: "string" },
      credentialId: { type: "string" },
      expiresAt: { type: "string", format: "date-time" },
      consent: { type: "string", enum: ["GRANTED", "PRESENTED", "NOT_GRANTED", "OPTED_OUT", "NOT_CHECKED_OFFLINE"] },
      claims: { type: ["array", "null"], items: claim, description: "Null unless the student allowed this caller to see them." },
      identity: { type: "string", example: "[Aadhaar Redacted]" },
    },
    required: ["index", "status"],
  };
  const error = { type: "object", properties: { success: { const: false }, error: { type: "string" } }, required: ["success", "error"] };
  const errors = {
    "400": { description: "Invalid request body", content: { "application/json": { schema: error } } },
    "401": { description: "Missing or invalid credentials", content: { "application/json": { schema: error } } },
    "403": { description: "This role cannot do this", content: { "application/json": { schema: error } } },
    "413": { description: "Body too large", content: { "application/json": { schema: error } } },
    "429": { description: "Rate limited. Retry-After says when to try again.", content: { "application/json": { schema: error } } },
  };

  return {
    openapi: "3.1.0",
    info: {
      title: "APAAR Bridge verification API",
      version: "1.0.0",
      description:
        "Verify Smart QR credentials and APAAR IDs. Consent is enforced per student: a plain credential returns claims only if the student shared with the caller, and a student-made QR carries only the claims the student chose. Identity numbers are never returned.",
    },
    servers: baseUrl ? [{ url: baseUrl }] : [],
    security: [{ apiKey: [] }],
    components: {
      securitySchemes: {
        apiKey: { type: "apiKey", in: "header", name: "x-api-key", description: "Your key, from GET /api/verify/bulk while signed in as a verifier." },
        session: { type: "apiKey", in: "cookie", name: "apaar_session", description: "A signed-in verifier session (used by the web app)." },
      },
    },
    paths: {
      "/api/verify/bulk": {
        post: {
          summary: "Verify up to 100 credentials in one call",
          description: "Each item gets the same checks as a single verification. Limited to 30 calls a minute per verifier.",
          security: [{ apiKey: [] }, { session: [] }],
          requestBody: {
            required: true,
            content: { "application/json": { schema: { type: "object", properties: { items: { type: "array", minItems: 1, maxItems: 100, items: item } }, required: ["items"] } } },
          },
          responses: {
            "200": {
              description: "One result per item, in order",
              content: { "application/json": { schema: { type: "object", properties: { success: { const: true }, count: { type: "integer" }, results: { type: "array", items: result } } } } },
            },
            ...errors,
          },
        },
        get: {
          summary: "Get your API key",
          security: [{ session: [] }],
          responses: { "200": { description: "Your key and the limits" }, ...errors },
        },
      },
      "/api/verify/credential": {
        post: {
          summary: "Verify one credential",
          security: [{ session: [] }],
          requestBody: {
            required: true,
            content: { "application/json": { schema: { type: "object", properties: { mode: { type: "string", enum: ["ONLINE", "OFFLINE"], default: "ONLINE" }, qr: { type: "string" }, apaarId: { type: "string" } } } } },
          },
          responses: { "200": { description: "The verification result, with the checks that were made" }, ...errors },
        },
      },
      "/api/health": {
        get: {
          summary: "Which settings are present (booleans only)",
          security: [],
          responses: { "200": { description: "Configured" }, "503": { description: "A required setting is missing" } },
        },
      },
    },
  };
}
