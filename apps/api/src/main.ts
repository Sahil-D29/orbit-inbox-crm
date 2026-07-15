import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import session from "express-session";
import helmet from "helmet";
import { AppModule } from "./app.module";

declare module "express-session" {
  interface SessionData {
    userId: string;
  }
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { rawBody: true });
  app.setGlobalPrefix("v1");
  app.enableCors({
    origin: process.env.WEB_URL ?? "http://localhost:3000",
    credentials: true,
    allowedHeaders: ["Content-Type", "Authorization", "X-Tenant-Id", "X-User-Id", "Idempotency-Key"],
  });
  app.use(
    session({
      secret: process.env.SESSION_SECRET ?? "orbit-inbox-dev-session-secret-change-in-production",
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      },
    }),
  );
  app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
  app.enableShutdownHooks();
  await app.listen(Number(process.env.PORT ?? 4000), "0.0.0.0");
}

void bootstrap();
