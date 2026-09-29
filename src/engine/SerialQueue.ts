// Runs async tasks strictly one after another. Fills go through this so
// each fill starts from the pixels the previous fill produced; two quick
// taps used to race and the second erased the first.
export class SerialQueue {
  private tail: Promise<unknown> = Promise.resolve();
  private count = 0;

  get pending(): number {
    return this.count;
  }

  run<T>(task: () => Promise<T>): Promise<T> {
    this.count++;
    const result = this.tail.then(task);
    this.tail = result.catch(() => {}).finally(() => { this.count--; });
    return result;
  }
}
