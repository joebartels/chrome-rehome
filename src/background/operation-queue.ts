export function createOperationQueue() {
  let tail = Promise.resolve();

  return {
    run<T>(job: () => Promise<T>): Promise<T> {
      const result = tail.then(job);
      tail = result.then(() => undefined, () => undefined);
      return result;
    },
  };
}
