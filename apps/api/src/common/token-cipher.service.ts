import { Injectable, InternalServerErrorException } from "@nestjs/common";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

@Injectable()
export class TokenCipherService {
  private key(): Buffer {
    const configured = process.env.TOKEN_ENCRYPTION_KEY;
    if (!configured) {
      if (process.env.NODE_ENV === "production") {
        throw new InternalServerErrorException("TOKEN_ENCRYPTION_KEY must be backed by KMS in production");
      }
      return Buffer.from("development-key-do-not-use-00001", "utf8");
    }
    const key = Buffer.from(configured, "base64");
    if (key.length !== 32) throw new InternalServerErrorException("TOKEN_ENCRYPTION_KEY must decode to 32 bytes");
    return key;
  }

  encrypt(value: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key(), iv);
    const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
    return [iv, cipher.getAuthTag(), ciphertext].map((part) => part.toString("base64url")).join(".");
  }

  decrypt(value: string): string {
    const [ivText, tagText, cipherText] = value.split(".");
    if (!ivText || !tagText || !cipherText) throw new Error("Invalid encrypted token");
    const decipher = createDecipheriv("aes-256-gcm", this.key(), Buffer.from(ivText, "base64url"));
    decipher.setAuthTag(Buffer.from(tagText, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(cipherText, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  }
}
