import type Database from 'better-sqlite3';
import type {CalendarEvent, CalendarEventCreate, CalendarEventPatch, CalendarProviderStatus} from '../types.js';

export type CalendarProvider = {
  readonly status: CalendarProviderStatus;
  list(): CalendarEvent[];
  create(input: CalendarEventCreate): CalendarEvent;
  update(id: string, input: CalendarEventPatch): CalendarEvent | null;
  delete(id: string): boolean;
};

export class CalendarProviderError extends Error {
  readonly statusCode = 503;
  readonly code: 'CALENDAR_PROVIDER_DISABLED' | 'CALENDAR_EVENT_NOT_FOUND';
  readonly provider: CalendarProviderStatus['provider'];

  constructor(code: 'CALENDAR_PROVIDER_DISABLED' | 'CALENDAR_EVENT_NOT_FOUND', message: string, provider: CalendarProviderStatus['provider']) {
    super(message);
    this.name = 'CalendarProviderError';
    this.code = code;
    this.provider = provider;
  }
}

const now = () => new Date().toISOString();
const eventId = () => `event-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export class MockCalendarProvider implements CalendarProvider {
  readonly status: CalendarProviderStatus = {provider: 'mock', enabled: true, mode: 'mock'};

  constructor(private readonly db: Database.Database) {}

  list(): CalendarEvent[] {
    return this.db.prepare('SELECT id,title,starts_at startsAt,ends_at endsAt,description,location,updated_at updatedAt FROM calendar_events ORDER BY starts_at').all() as CalendarEvent[];
  }

  create(input: CalendarEventCreate): CalendarEvent {
    const event: CalendarEvent = {...input, id: eventId(), updatedAt: now()};
    this.db.prepare('INSERT INTO calendar_events VALUES (@id,@title,@startsAt,@endsAt,@description,@location,@updatedAt)').run(event);
    return event;
  }

  update(id: string, input: CalendarEventPatch): CalendarEvent | null {
    const current = this.list().find((event) => event.id === id);
    if (!current) return null;
    const event: CalendarEvent = {...current, ...input, updatedAt: now()};
    this.db.prepare('UPDATE calendar_events SET title=@title,starts_at=@startsAt,ends_at=@endsAt,description=@description,location=@location,updated_at=@updatedAt WHERE id=@id').run(event);
    return event;
  }

  delete(id: string): boolean {
    return this.db.prepare('DELETE FROM calendar_events WHERE id=?').run(id).changes > 0;
  }
}

export class GoogleCalendarProvider implements CalendarProvider {
  readonly status: CalendarProviderStatus = {
    provider: 'google',
    enabled: false,
    mode: 'disabled',
    reason: 'Google Calendar OAuth/API integration is reserved and not configured',
  };

  private disabled(): never {
    throw new CalendarProviderError('CALENDAR_PROVIDER_DISABLED', this.status.reason!, 'google');
  }

  list(): CalendarEvent[] { return this.disabled(); }
  create(_input: CalendarEventCreate): CalendarEvent { return this.disabled(); }
  update(_id: string, _input: CalendarEventPatch): CalendarEvent | null { return this.disabled(); }
  delete(_id: string): boolean { return this.disabled(); }
}

export function createCalendarProvider(db: Database.Database, provider: 'mock' | 'google' = 'mock'): CalendarProvider {
  return provider === 'google' ? new GoogleCalendarProvider() : new MockCalendarProvider(db);
}
