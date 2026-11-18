export interface PendingScan {
  readonly code: string;
  readonly scannedAt: string;
}

export interface QueueStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

const MAX_BATCH = 500;

/**
 * Scans taken while the door has no connection. They keep the instant they were
 * read, and are replayed oldest first once the network is back, so the first
 * read of a ticket wins and a duplicate is reported as one. Persisted, so a
 * crash or a closed app does not lose admissions.
 */
export class ScanQueue {
  private items: PendingScan[] = [];
  private loaded = false;

  constructor(
    private readonly storage: QueueStorage,
    private readonly key: string,
  ) {}

  private async load(): Promise<void> {
    if (this.loaded) return;
    const raw = await this.storage.getItem(this.key);
    try {
      const parsed = raw ? (JSON.parse(raw) as unknown) : [];
      this.items = Array.isArray(parsed)
        ? parsed.filter(
            (x): x is PendingScan =>
              typeof x?.code === 'string' && typeof x?.scannedAt === 'string',
          )
        : [];
    } catch {
      this.items = [];
    }
    this.loaded = true;
  }

  private persist(): Promise<void> {
    return this.storage.setItem(this.key, JSON.stringify(this.items));
  }

  async size(): Promise<number> {
    await this.load();
    return this.items.length;
  }

  async add(scan: PendingScan): Promise<void> {
    await this.load();
    // The same code twice in a row is the camera re-reading one ticket, not two admissions.
    if (this.items.some((i) => i.code === scan.code)) return;
    this.items.push(scan);
    await this.persist();
  }

  /**
   * Sends everything queued through `send` in batches. A batch that fails stays
   * queued; one that is accepted is removed, so a flush interrupted halfway
   * resumes where it stopped.
   */
  async flush(send: (batch: PendingScan[]) => Promise<void>): Promise<number> {
    await this.load();
    let sent = 0;
    while (this.items.length > 0) {
      const batch = this.items.slice(0, MAX_BATCH);
      await send(batch);
      this.items = this.items.slice(batch.length);
      sent += batch.length;
      await this.persist();
    }
    return sent;
  }
}
