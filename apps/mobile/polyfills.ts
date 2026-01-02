import { Buffer } from "buffer";

const globalBuffer = globalThis as typeof globalThis & {
  Buffer?: typeof Buffer;
};

if (!globalBuffer.Buffer) {
  globalBuffer.Buffer = Buffer;
}
