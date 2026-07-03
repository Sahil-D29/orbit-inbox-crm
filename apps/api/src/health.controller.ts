import { Controller, Get } from "@nestjs/common";
import { Public } from "./auth/public.decorator";

@Controller("health")
export class HealthController {
  @Public()
  @Get()
  check() {
    return { status: "ok", service: "crm-api", timestamp: new Date().toISOString() };
  }
}
