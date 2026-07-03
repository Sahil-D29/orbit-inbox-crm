import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { TokenCipherService } from "../common/token-cipher.service";
import { OAuthStateService } from "./oauth-state.service";

describe("OAuthStateService", () => {
  it("binds the callback to the tenant, user, provider, and PKCE verifier", () => {
    process.env.NODE_ENV = "test";
    process.env.TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 4).toString("base64");
    const stateService = new OAuthStateService(new TokenCipherService());
    const created = stateService.create(
      { tenantId: "tenant-1", userId: "user-1", role: "ADMIN" },
      "GMAIL",
    );
    const consumed = stateService.consume(created.state);

    assert.equal(consumed.tenantId, "tenant-1");
    assert.equal(consumed.userId, "user-1");
    assert.equal(consumed.provider, "GMAIL");
    assert.ok(consumed.verifier.length > 40);
    assert.ok(created.codeChallenge.length > 40);
  });

  it("rejects tampered callback state", () => {
    process.env.NODE_ENV = "test";
    process.env.TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 4).toString("base64");
    const stateService = new OAuthStateService(new TokenCipherService());
    const created = stateService.create(
      { tenantId: "tenant-1", userId: "user-1", role: "ADMIN" },
      "WHATSAPP",
    );

    const parts = created.state.split(".");
    const ciphertext = parts[2]!;
    parts[2] = `${ciphertext[0] === "A" ? "B" : "A"}${ciphertext.slice(1)}`;
    assert.throws(() => stateService.consume(parts.join(".")));
  });
});
