import { Injectable, MessageEvent } from "@nestjs/common";
import { filter, map, Observable, Subject } from "rxjs";

interface TenantEvent {
  tenantId: string;
  type: string;
  data: string | object;
}

@Injectable()
export class EventStreamService {
  private readonly events = new Subject<TenantEvent>();

  publish(tenantId: string, type: string, data: unknown) {
    this.events.next({
      tenantId,
      type,
      data: typeof data === "object" && data !== null ? data : String(data),
    });
  }

  forTenant(tenantId: string): Observable<MessageEvent> {
    return this.events.pipe(
      filter((event) => event.tenantId === tenantId),
      map((event) => ({ type: event.type, data: event.data })),
    );
  }
}
