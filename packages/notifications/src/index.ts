/**
 * Notification abstraction for administrator alerts (processing failures, broken files,
 * no-result search digests). The default provider logs; an SMTP/email provider can be
 * added later without changing callers.
 */
export interface Notification {
  subject: string;
  body: string;
  severity: 'info' | 'warning' | 'error';
  meta?: Record<string, unknown>;
}

export interface NotificationProvider {
  readonly name: string;
  notifyAdmins(notification: Notification): Promise<void>;
}

export class LogNotificationProvider implements NotificationProvider {
  readonly name = 'log';
  async notifyAdmins(n: Notification): Promise<void> {
    const line = JSON.stringify({ level: n.severity, msg: n.subject, body: n.body, ...n.meta });
    if (n.severity === 'error') console.error(line);
    else console.log(line);
  }
}

let provider: NotificationProvider = new LogNotificationProvider();

export function getNotifier(): NotificationProvider {
  return provider;
}

export function setNotifier(p: NotificationProvider): void {
  provider = p;
}
