import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { db } from "@crm/database";
import type { Request } from "express";
import { IS_PUBLIC } from "./public.decorator";

@Injectable()
export class TenantGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [context.getHandler(), context.getClass()])) {
      return true;
    }
    const request = context.switchToHttp().getRequest<
      Request & { tenantContext?: { tenantId: string; userId: string; role: "ADMIN" | "AGENT" }; session?: { userId?: string } }
    >();

    let userId: string | undefined;

    // 1. Session-based auth (production + development)
    if (request.session?.userId) {
      userId = request.session.userId;
    }

    // 2. Dev header fallback (development only)
    if (!userId && process.env.NODE_ENV !== "production") {
      userId = request.header("x-user-id") ?? process.env.DEV_USER_ID;
    }

    if (!userId) throw new UnauthorizedException("A verified session is required");

    // Determine tenant from header (dev) or first active membership (session)
    let tenantId = request.header("x-tenant-id") ?? process.env.DEV_TENANT_ID;
    if (!tenantId && request.session?.userId) {
      const membership = await db.membership.findFirst({
        where: { userId, status: "ACTIVE" },
        orderBy: { joinedAt: "asc" },
      });
      if (membership) tenantId = membership.tenantId;
    }

    if (!tenantId) throw new UnauthorizedException("A verified tenant session is required");

    if (process.env.NODE_ENV === "production" && !request.session?.userId) {
      throw new UnauthorizedException("Session authentication is required in production");
    }

    const membership = await db.membership.findUnique({
      where: { tenantId_userId: { tenantId, userId } },
    });
    if (!membership) throw new ForbiddenException("User does not belong to this tenant");

    request.tenantContext = { tenantId, userId, role: membership.role };
    return true;
  }
}
