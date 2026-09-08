export class ApiError extends Error {
  constructor(status, code) { super(code); this.status = status; this.code = code; }
}

export class Cache {
  entries = new Map();
  pending = new Map();
  failures = new Map();
  constructor(now = Date.now) { this.now = now; }
  async get(key, ttl, loader) {
    const failed = this.failures.get(key);
    if (failed && failed.expires > this.now()) throw failed.error;
    this.failures.delete(key);
    const previous = this.entries.get(key);
    if (previous && previous.expires > this.now()) return previous.value;
    if (this.pending.has(key)) return this.pending.get(key);
    const task = (async () => {
      try {
        const data = await loader();
        const value = { data, fetchedAt: new Date(this.now()).toISOString(), stale: false };
        this.entries.set(key, { value, expires: this.now() + ttl });
        if (this.entries.size > 1000) this.entries.delete(this.entries.keys().next().value);
        return value;
      } catch (error) {
        if (previous && this.now() - Date.parse(previous.value.fetchedAt) < 86400000) {
          const value = { ...previous.value, stale: true, warning: error.code || 'API_UNAVAILABLE' };
          this.entries.set(key, { value, expires: this.now() + 60000 });
          return value;
        }
        this.failures.set(key, {error, expires:this.now()+60000});
        if(this.failures.size>1000)this.failures.delete(this.failures.keys().next().value);
        throw error;
      } finally { this.pending.delete(key); }
    })();
    this.pending.set(key, task);
    return task;
  }
}
