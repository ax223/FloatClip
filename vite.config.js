import { fileURLToPath, URL } from "node:url";

export default {
  server: {
    host: "127.0.0.1",
    port: 1420,
    strictPort: true,
  },
  build: {
    rollupOptions: {
      input: {
        index: fileURLToPath(new URL("./index.html", import.meta.url)),
        bubble: fileURLToPath(new URL("./bubble.html", import.meta.url)),
        settings: fileURLToPath(new URL("./settings.html", import.meta.url)),
      },
    },
  },
};
