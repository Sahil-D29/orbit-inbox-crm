import { Body, Controller, Get, HttpCode, Post, Req, Res, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { hash, compare } from "bcrypt";
import { db } from "@crm/database";
import type { Request, Response } from "express";
import { Public } from "./public.decorator";
import { CurrentTenant } from "./tenant-context.decorator";
import type { TenantContext } from "@crm/contracts";

@Controller("auth")
export class AuthController {
  private readonly devMode: boolean;

  constructor(config: ConfigService) {
    this.devMode = config.get("NODE_ENV") !== "production";
  }

  @Public()
  @Post("sign-up")
  async signUp(
    @Body() body: { email: string; name: string; password: string; tenantName: string; tenantSlug: string },
    @Res({ passthrough: true }) response: Response,
  ) {
    const email = body.email?.trim().toLowerCase();
    if (!email?.includes("@")) throw new UnauthorizedException("Valid email is required");
    if (!body.password || body.password.length < 6) throw new UnauthorizedException("Password must be at least 6 characters");
    const existing = await db.user.findUnique({ where: { email } });
    if (existing) throw new UnauthorizedException("Email is already registered");

    const passwordHashValue = await hash(body.password, 10);
    const user = await db.$transaction(async (tx) => {
      const baseName = (body.name?.trim() || email.split("@")[0]) as string;
      const tenant = await tx.tenant.create({
        data: {
          name: (body.tenantName?.trim() || `${baseName}'s Workspace`) as string,
          slug: (body.tenantSlug?.trim().toLowerCase() || email.split("@")[0]) as string,
        },
      });
      const newUser = await tx.user.create({
        data: {
          email,
          name: baseName,
          passwordHash: passwordHashValue,
        },
      });
      await tx.membership.create({
        data: {
          tenantId: tenant.id,
          userId: newUser.id,
          role: "ADMIN",
          status: "ACTIVE",
          availability: "ONLINE",
          joinedAt: new Date(),
        },
      });
      return newUser;
    });

    const session = response.req as Request & { session?: Record<string, unknown> };
    if (session.session) {
      session.session.userId = user.id;
    }
    return { user: { id: user.id, email: user.email, name: user.name } };
  }

  @Public()
  @HttpCode(200)
  @Post("sign-in")
  async signIn(
    @Body() body: { email: string; password: string },
    @Res({ passthrough: true }) response: Response,
  ) {
    const email = body.email?.trim().toLowerCase();
    if (!email) throw new UnauthorizedException("Email is required");

    const user = await db.user.findUnique({ where: { email } });
    if (!user || !user.passwordHash) throw new UnauthorizedException("Invalid email or password");

    const valid = await compare(body.password, user.passwordHash);
    if (!valid) throw new UnauthorizedException("Invalid email or password");

    const session = response.req as Request & { session?: Record<string, unknown> };
    if (session.session) {
      session.session.userId = user.id;
    }
    return { user: { id: user.id, email: user.email, name: user.name } };
  }

  @Public()
  @HttpCode(200)
  @Post("sign-out")
  signOut(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    const session = request as Request & { session?: Record<string, unknown> };
    if (session.session) {
      session.session.destroy?.(() => {});
    }
    response.clearCookie("connect.sid");
    return { signedOut: true };
  }

  @Get("me")
  async me(@CurrentTenant() context: TenantContext) {
    const [user, memberships] = await Promise.all([
      db.user.findUnique({ where: { id: context.userId }, select: { id: true, email: true, name: true, avatarUrl: true } }),
      db.membership.findMany({
        where: { userId: context.userId, status: "ACTIVE" },
        include: { tenant: { select: { id: true, name: true, slug: true } } },
      }),
    ]);
    if (!user) throw new UnauthorizedException("User not found");
    const currentMembership = memberships.find((m) => m.tenantId === context.tenantId);
    return {
      user,
      tenants: memberships.map((m) => ({ id: m.tenant.id, name: m.tenant.name, slug: m.tenant.slug })),
      currentTenant: currentMembership
        ? { id: currentMembership.tenantId, name: currentMembership.tenant.name, slug: currentMembership.tenant.slug, role: currentMembership.role }
        : null,
    };
  }
}
