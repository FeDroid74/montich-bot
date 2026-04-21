import { createApp } from "./app/create-app.js";

const app = createApp();

async function main(): Promise<void> {
  await app.start();

  process.once("SIGINT", () => {
    void app.stop("SIGINT");
  });

  process.once("SIGTERM", () => {
    void app.stop("SIGTERM");
  });
}

void main();
