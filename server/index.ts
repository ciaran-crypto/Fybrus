import express from "express";
import { registerRoutes } from "./routes";

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

const server = await registerRoutes(app);

const port = parseInt(process.env.PORT || "3001", 10);
const host = process.env.NODE_ENV === "production" ? "0.0.0.0" : "127.0.0.1";
server.listen({ port, host }, () => {
  console.log(`[paystrax] Server running on http://${host}:${port}`);
});
