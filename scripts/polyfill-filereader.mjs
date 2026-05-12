if (typeof globalThis.FileReader === "undefined") {
  globalThis.FileReader = class {
    result = null;
    onloadend = null;
    readAsArrayBuffer(blob) {
      Promise.resolve(blob)
        .then((b) => b.arrayBuffer())
        .then((ab) => {
          this.result = ab;
          this.onloadend?.();
        });
    }
  };
}
