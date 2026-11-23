/** Keep provider events cheap even when persisting a large Work takes longer than a token. */
export function createStreamText(
  save: (text: string) => Promise<unknown>,
  intervalMs = 1000,
) {
  let text = '',
    saved = '',
    closed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let writing: Promise<void> | undefined;
  let failure: unknown;
  function schedule() {
    if (closed || timer || writing || failure || text === saved) return;
    timer = setTimeout(() => {
      timer = undefined;
      const snapshot = text;
      writing = Promise.resolve()
        .then(() => save(snapshot))
        .then(() => {
          saved = snapshot;
        })
        .catch((error) => {
          failure = error;
        })
        .finally(() => {
          writing = undefined;
          schedule();
        });
    }, intervalMs);
  }
  return {
    push(delta: string) {
      if (failure) throw failure;
      if (closed) throw Error('文字流已经结束。');
      text += delta;
      schedule();
    },
    get text() {
      return text;
    },
    /** The caller saves full text and terminal status together after all older writes settle. */
    async finish() {
      closed = true;
      clearTimeout(timer);
      await writing;
      if (failure) throw failure;
    },
  };
}
