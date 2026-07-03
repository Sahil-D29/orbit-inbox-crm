import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { TokenCipherService } from "./token-cipher.service";

const originalEnvironment = process.env.NODE_ENV;
const originalKey = process.env.TOKEN_ENCRYPTION_KEY;

afterEach(() => {
  process.env.NODE_ENV = originalEnvironment;
  if (originalKey === undefined) delete process.env.TOKEN_ENCRYPTION_KEY;
  else process.env.TOKEN_ENCRYPTION_KEY = originalKey;
});

describe("TokenCipherService", () => {
  it("round-trips a provider token without storing plaintext", () => {
    process.env.NODE_ENV = "test";
    process.env.TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
    const cipher = new TokenCipherService();
    const encrypted = cipher.encrypt("provider-secret-token");

    assert.notEqual(encrypted, "provider-secret-token");
    assert.equal(encrypted.split(".").length, 3);
    assert.equal(cipher.decrypt(encrypted), "provider-secret-token");
  });

  it("rejects authentication tags produced with a different key", () => {
    process.env.NODE_ENV = "test";
    process.env.TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
    const cipher = new TokenCipherService();
    const encrypted = cipher.encrypt("provider-secret-token");

    process.env.TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 8).toString("base64");
    assert.throws(() => cipher.decrypt(encrypted));
  });
});
