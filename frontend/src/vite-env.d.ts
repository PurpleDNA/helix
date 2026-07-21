/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Backend origin for WebSocket traffic, e.g. wss://api.purplehelix.lol */
  readonly VITE_WS_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
