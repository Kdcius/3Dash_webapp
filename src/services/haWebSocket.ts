import type { HAState } from '../types';

export type HAConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error' | 'auth_error';

export interface HACallbacks {
  onStateChanged?: (entityId: string, state: HAState) => void;
  onInitialStates?: (states: HAState[]) => void;
  onStatusChanged?: (status: HAConnectionStatus) => void;
}

/** Minimal interface shared by HAConnection and DemoHAConnection. */
export interface HALike {
  callService(domain: string, service: string, entityId: string, data?: Record<string, unknown>): Promise<void>;
  request(msg: Record<string, unknown>): Promise<unknown>;
  readonly isConnected: boolean;
  /** Tear down the current socket and reconnect immediately. */
  forceReconnect(): void;
  dispose(): void;
}

/** Module-level reference to the active HA connection (set by Dashboard). */
let activeConnection: HALike | null = null;
export function setActiveHAConnection(conn: HALike | null) { activeConnection = conn; }
export function getActiveHAConnection(): HALike | null { return activeConnection; }

export interface HAConnectOptions {
  url: string;
  port: number;
  token: string;
}

/** Build a WebSocket URL, using wss:// when the page is served over HTTPS. */
export function buildWsUrl(url: string, port: number): string {
  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
  return `${protocol}://${url}:${port}/api/websocket`;
}

export class HAConnection {
  private ws: WebSocket | null = null;
  private msgId = 1;
  private callbacks: HACallbacks;
  private options: HAConnectOptions;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private pongTimer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;
  private pendingResults = new Map<number, { resolve: (value?: unknown) => void; reject: (err: Error) => void }>();

  constructor(options: HAConnectOptions, callbacks: HACallbacks) {
    this.options = options;
    this.callbacks = callbacks;
  }

  connect(): void {
    if (this.disposed) return;
    this.callbacks.onStatusChanged?.('connecting');

    const { url, port } = this.options;
    const wsUrl = buildWsUrl(url, port);
    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      // Wait for auth_required from HA
    };

    this.ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);

      if (msg.type === 'auth_required') {
        this.send({ type: 'auth', access_token: this.options.token });
        return;
      }

      if (msg.type === 'auth_ok') {
        this.callbacks.onStatusChanged?.('connected');
        // Subscribe to state changes
        this.send({ id: this.msgId++, type: 'subscribe_events', event_type: 'state_changed' });
        // Fetch initial states
        this.send({ id: this.msgId++, type: 'get_states' });
        // Start pinging so a silently-dropped (zombie) socket is detected
        this.startHeartbeat();
        return;
      }

      if (msg.type === 'auth_invalid') {
        this.callbacks.onStatusChanged?.('auth_error');
        return;
      }

      if (msg.type === 'pong') {
        // Socket is alive — cancel the pending zombie-reconnect
        if (this.pongTimer) { clearTimeout(this.pongTimer); this.pongTimer = null; }
        return;
      }

      if (msg.type === 'event' && msg.event?.event_type === 'state_changed') {
        const { entity_id, new_state } = msg.event.data;
        this.callbacks.onStateChanged?.(entity_id, new_state);
        return;
      }

      if (msg.type === 'result') {
        const pending = this.pendingResults.get(msg.id);
        if (pending) {
          this.pendingResults.delete(msg.id);
          msg.success ? pending.resolve(msg.result) : pending.reject(new Error(msg.error?.message ?? 'Service call failed'));
        } else if (Array.isArray(msg.result)) {
          this.callbacks.onInitialStates?.(msg.result);
        }
        return;
      }
    };

    this.ws.onerror = () => {
      this.callbacks.onStatusChanged?.('error');
    };

    this.ws.onclose = () => {
      this.stopHeartbeat();
      for (const p of this.pendingResults.values()) p.reject(new Error('Connection closed'));
      this.pendingResults.clear();
      if (this.disposed) return;
      this.callbacks.onStatusChanged?.('disconnected');
      this.reconnectTimer = setTimeout(() => this.connect(), 5000);
    };
  }

  /**
   * Tear down the current socket (without waiting for `onclose`) and reconnect
   * immediately. Use after the app returns from the background, where the OS may
   * have killed the TCP connection while leaving the WebSocket reporting OPEN.
   */
  forceReconnect(): void {
    if (this.disposed) return;
    this.stopHeartbeat();
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
    if (this.ws) {
      // Detach handlers so the stale socket's onclose can't arm another reconnect
      this.ws.onopen = this.ws.onmessage = this.ws.onerror = this.ws.onclose = null;
      try { this.ws.close(); } catch { /* already closing */ }
      this.ws = null;
    }
    // Fail any in-flight requests so callers don't hang on the dead socket
    for (const p of this.pendingResults.values()) p.reject(new Error('Reconnecting'));
    this.pendingResults.clear();
    this.connect();
  }

  /** Periodically ping HA; if no pong returns in time, the socket is dead → reconnect. */
  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (this.ws?.readyState !== WebSocket.OPEN) return;
      this.send({ id: this.msgId++, type: 'ping' });
      if (this.pongTimer) clearTimeout(this.pongTimer);
      this.pongTimer = setTimeout(() => this.forceReconnect(), 5000);
    }, 20000);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) { clearInterval(this.heartbeatTimer); this.heartbeatTimer = null; }
    if (this.pongTimer) { clearTimeout(this.pongTimer); this.pongTimer = null; }
  }

  callService(domain: string, service: string, entityId: string, data?: Record<string, unknown>): Promise<void> {
    return this.request({
      type: 'call_service',
      domain,
      service,
      target: { entity_id: entityId },
      ...(data ? { service_data: data } : {}),
    }) as Promise<void>;
  }

  /** Send an arbitrary WS message and return the result. */
  request(msg: Record<string, unknown>): Promise<unknown> {
    const id = this.msgId++;
    return new Promise((resolve, reject) => {
      this.pendingResults.set(id, { resolve, reject });
      this.send({ ...msg, id });
      setTimeout(() => {
        if (this.pendingResults.delete(id)) reject(new Error('Timeout'));
      }, 15000);
    });
  }

  private send(msg: unknown): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  dispose(): void {
    this.disposed = true;
    this.stopHeartbeat();
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.ws?.close();
    this.ws = null;
  }
}
