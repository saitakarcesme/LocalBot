/** Leading and trailing snapshots: a quiet process must not hide its last burst. */
export class OutputBatch {
  private pending: string | undefined;
  private timer?: ReturnType<typeof setTimeout>;
  private last = 0;
  private closed = false;
  constructor(private emit?: (output: string) => void, private interval = 500) {}
  push(output: string) {
    if (this.closed || !this.emit) return;
    this.pending = output;
    const delay = this.interval - (Date.now() - this.last);
    if (delay <= 0) this.flush();
    else if (!this.timer) this.timer = setTimeout(() => this.flush(), delay);
  }
  private flush() {
    clearTimeout(this.timer); this.timer = undefined;
    if (this.pending === undefined) return;
    const value = this.pending; this.pending = undefined; this.last = Date.now();
    this.emit?.(value);
  }
  close() {
    if (this.closed) return;
    this.flush(); this.closed = true;
  }
}
