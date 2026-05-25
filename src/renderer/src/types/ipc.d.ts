import type { LtorApi } from "../../../preload/index";

declare global {
  interface Window {
    ltor: LtorApi;
  }
}

export {};
